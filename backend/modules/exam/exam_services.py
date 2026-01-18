"""
考试模块业务逻辑
实现题库、试卷、考试的管理操作
"""

import logging
import random
from typing import Optional, List, Tuple
from utils.timezone import get_beijing_time
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .exam_models import (
    ExamQuestionBank, ExamQuestion, ExamPaper, 
    ExamPaperQuestion, ExamRecord, ExamAnswer, ExamWrongQuestion, ExamCheatLog
)
from .exam_schemas import (
    QuestionBankCreate, QuestionBankUpdate,
    QuestionCreate, QuestionUpdate,
    PaperCreate, PaperUpdate,
    ExamSubmitAnswer, GradeAnswer,
    SmartPaperCreate, SmartPaperRule,
    QuestionImportRequest, QuestionImportItem,
    CheatLogCreate
)

logger = logging.getLogger(__name__)


class ExamService:
    """
    考试服务类
    提供题库、试卷、考试的完整操作
    """
    
    # ==================== 题库操作 ====================
    
    @staticmethod
    async def create_bank(
        db: AsyncSession,
        user_id: int,
        data: QuestionBankCreate
    ) -> ExamQuestionBank:
        """创建题库"""
        bank = ExamQuestionBank(
            user_id=user_id,
            **data.model_dump()
        )
        db.add(bank)
        await db.flush()
        await db.refresh(bank)
        logger.info(f"创建题库: id={bank.id}, name={bank.name}")
        return bank
    
    @staticmethod
    async def get_bank_by_id(
        db: AsyncSession,
        bank_id: int,
        user_id: Optional[int] = None
    ) -> Optional[ExamQuestionBank]:
        """获取题库"""
        query = select(ExamQuestionBank).where(ExamQuestionBank.id == bank_id)
        if user_id:
            query = query.where(ExamQuestionBank.user_id == user_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_bank_list(
        db: AsyncSession,
        user_id: int,
        keyword: Optional[str] = None
    ) -> List[ExamQuestionBank]:
        """获取题库列表"""
        conditions = [ExamQuestionBank.user_id == user_id]
        if keyword:
            conditions.append(ExamQuestionBank.name.ilike(f"%{keyword}%"))
        
        query = select(ExamQuestionBank).where(and_(*conditions))
        query = query.order_by(ExamQuestionBank.created_at.desc())
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_bank(
        db: AsyncSession,
        bank_id: int,
        data: QuestionBankUpdate,
        user_id: int
    ) -> Optional[ExamQuestionBank]:
        """更新题库"""
        bank = await ExamService.get_bank_by_id(db, bank_id, user_id)
        if not bank:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(bank, key, value)
        
        await db.flush()
        await db.refresh(bank)
        return bank
    
    @staticmethod
    async def delete_bank(
        db: AsyncSession,
        bank_id: int,
        user_id: int
    ) -> bool:
        """删除题库"""
        bank = await ExamService.get_bank_by_id(db, bank_id, user_id)
        if not bank:
            return False
        await db.delete(bank)
        await db.flush()
        logger.info(f"删除题库: id={bank_id}")
        return True
    
    # ==================== 题目操作 ====================
    
    @staticmethod
    async def create_question(
        db: AsyncSession,
        user_id: int,
        data: QuestionCreate
    ) -> ExamQuestion:
        """创建题目"""
        question_data = data.model_dump()
        # 处理选项
        if question_data.get('options'):
            question_data['options'] = [opt.model_dump() if hasattr(opt, 'model_dump') else opt for opt in question_data['options']]
        
        question = ExamQuestion(
            user_id=user_id,
            **question_data
        )
        db.add(question)
        await db.flush()
        await db.refresh(question)
        
        # 更新题库计数
        if question.bank_id:
            await ExamService._update_bank_count(db, question.bank_id)
        
        logger.info(f"创建题目: id={question.id}, type={question.question_type}")
        return question
    
    @staticmethod
    async def get_question_by_id(
        db: AsyncSession,
        question_id: int,
        user_id: Optional[int] = None
    ) -> Optional[ExamQuestion]:
        """获取题目"""
        query = select(ExamQuestion).where(ExamQuestion.id == question_id)
        if user_id:
            query = query.where(ExamQuestion.user_id == user_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_question_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        bank_id: Optional[int] = None,
        question_type: Optional[str] = None,
        keyword: Optional[str] = None,
        difficulty: Optional[int] = None
    ) -> Tuple[List[ExamQuestion], int]:
        """获取题目列表"""
        conditions = [ExamQuestion.user_id == user_id]
        
        if bank_id:
            conditions.append(ExamQuestion.bank_id == bank_id)
        if question_type:
            conditions.append(ExamQuestion.question_type == question_type)
        if keyword:
            conditions.append(ExamQuestion.title.ilike(f"%{keyword}%"))
        if difficulty:
            conditions.append(ExamQuestion.difficulty == difficulty)
        
        # 查询总数
        count_query = select(func.count(ExamQuestion.id)).where(and_(*conditions))
        total = (await db.execute(count_query)).scalar() or 0
        
        # 查询数据
        query = select(ExamQuestion).where(and_(*conditions))
        query = query.order_by(ExamQuestion.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        
        return list(result.scalars().all()), total
    
    @staticmethod
    async def update_question(
        db: AsyncSession,
        question_id: int,
        data: QuestionUpdate,
        user_id: int
    ) -> Optional[ExamQuestion]:
        """更新题目"""
        question = await ExamService.get_question_by_id(db, question_id, user_id)
        if not question:
            return None
        
        old_bank_id = question.bank_id
        update_data = data.model_dump(exclude_unset=True)
        
        # 处理选项
        if 'options' in update_data and update_data['options']:
            update_data['options'] = [opt.model_dump() if hasattr(opt, 'model_dump') else opt for opt in update_data['options']]
        
        for key, value in update_data.items():
            setattr(question, key, value)
        
        await db.flush()
        await db.refresh(question)
        
        # 更新题库计数
        if old_bank_id != question.bank_id:
            if old_bank_id:
                await ExamService._update_bank_count(db, old_bank_id)
            if question.bank_id:
                await ExamService._update_bank_count(db, question.bank_id)
        
        return question
    
    @staticmethod
    async def delete_question(
        db: AsyncSession,
        question_id: int,
        user_id: int
    ) -> bool:
        """删除题目"""
        question = await ExamService.get_question_by_id(db, question_id, user_id)
        if not question:
            return False
        
        bank_id = question.bank_id
        await db.delete(question)
        await db.flush()
        
        # 更新题库计数
        if bank_id:
            await ExamService._update_bank_count(db, bank_id)
        
        logger.info(f"删除题目: id={question_id}")
        return True
    
    @staticmethod
    async def _update_bank_count(db: AsyncSession, bank_id: int):
        """更新题库题目数量"""
        count_query = select(func.count(ExamQuestion.id)).where(
            ExamQuestion.bank_id == bank_id
        )
        count = (await db.execute(count_query)).scalar() or 0
        
        bank = await ExamService.get_bank_by_id(db, bank_id)
        if bank:
            bank.question_count = count
    
    # ==================== 试卷操作 ====================
    
    @staticmethod
    async def create_paper(
        db: AsyncSession,
        user_id: int,
        data: PaperCreate
    ) -> ExamPaper:
        """创建试卷"""
        paper_data = data.model_dump(exclude={'question_ids'})
        paper = ExamPaper(
            user_id=user_id,
            **paper_data
        )
        db.add(paper)
        await db.flush()
        await db.refresh(paper)
        
        # 添加题目
        if data.question_ids:
            await ExamService.add_paper_questions(db, paper.id, data.question_ids, user_id)
        
        logger.info(f"创建试卷: id={paper.id}, title={paper.title}")
        return paper
    
    @staticmethod
    async def get_paper_by_id(
        db: AsyncSession,
        paper_id: int,
        user_id: Optional[int] = None,
        include_questions: bool = False
    ) -> Optional[ExamPaper]:
        """获取试卷"""
        query = select(ExamPaper).where(ExamPaper.id == paper_id)
        if user_id:
            query = query.where(ExamPaper.user_id == user_id)
        if include_questions:
            query = query.options(selectinload(ExamPaper.paper_questions))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_paper_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        keyword: Optional[str] = None,
        is_admin: bool = False
    ) -> Tuple[List[ExamPaper], int]:
        """获取试卷列表"""
        conditions = []
        
        if not is_admin:
            # 非管理员只能看自己创建的或已发布的
            conditions.append(or_(
                ExamPaper.user_id == user_id,
                ExamPaper.status == "published"
            ))
        else:
            conditions.append(ExamPaper.user_id == user_id)
        
        if status:
            conditions.append(ExamPaper.status == status)
        if keyword:
            conditions.append(ExamPaper.title.ilike(f"%{keyword}%"))
        
        # 查询总数
        count_query = select(func.count(ExamPaper.id)).where(and_(*conditions))
        total = (await db.execute(count_query)).scalar() or 0
        
        # 查询数据
        query = select(ExamPaper).where(and_(*conditions))
        query = query.order_by(ExamPaper.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        
        return list(result.scalars().all()), total
    
    @staticmethod
    async def update_paper(
        db: AsyncSession,
        paper_id: int,
        data: PaperUpdate,
        user_id: int
    ) -> Optional[ExamPaper]:
        """更新试卷"""
        paper = await ExamService.get_paper_by_id(db, paper_id, user_id)
        if not paper:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(paper, key, value)
        
        await db.flush()
        await db.refresh(paper)
        return paper
    
    @staticmethod
    async def delete_paper(
        db: AsyncSession,
        paper_id: int,
        user_id: int
    ) -> bool:
        """删除试卷"""
        paper = await ExamService.get_paper_by_id(db, paper_id, user_id)
        if not paper:
            return False
        await db.delete(paper)
        await db.flush()
        logger.info(f"删除试卷: id={paper_id}")
        return True
    
    @staticmethod
    async def add_paper_questions(
        db: AsyncSession,
        paper_id: int,
        question_ids: List[int],
        user_id: int
    ) -> int:
        """添加试卷题目"""
        paper = await ExamService.get_paper_by_id(db, paper_id, user_id)
        if not paper:
            return 0
        
        # 获取当前最大排序
        max_order_query = select(func.max(ExamPaperQuestion.sort_order)).where(
            ExamPaperQuestion.paper_id == paper_id
        )
        max_order = (await db.execute(max_order_query)).scalar() or 0
        
        added = 0
        for i, qid in enumerate(question_ids):
            # 检查题目是否存在
            question = await ExamService.get_question_by_id(db, qid)
            if not question:
                continue
            
            # 检查是否已添加
            exist_query = select(ExamPaperQuestion).where(
                and_(
                    ExamPaperQuestion.paper_id == paper_id,
                    ExamPaperQuestion.question_id == qid
                )
            )
            if (await db.execute(exist_query)).scalar_one_or_none():
                continue
            
            pq = ExamPaperQuestion(
                paper_id=paper_id,
                question_id=qid,
                sort_order=max_order + i + 1,
                score=question.score
            )
            db.add(pq)
            added += 1
        
        # 更新试卷题目数量
        paper.question_count = paper.question_count + added
        
        await db.flush()
        return added
    
    @staticmethod
    async def remove_paper_question(
        db: AsyncSession,
        paper_id: int,
        question_id: int,
        user_id: int
    ) -> bool:
        """移除试卷题目"""
        paper = await ExamService.get_paper_by_id(db, paper_id, user_id)
        if not paper:
            return False
        
        query = select(ExamPaperQuestion).where(
            and_(
                ExamPaperQuestion.paper_id == paper_id,
                ExamPaperQuestion.question_id == question_id
            )
        )
        pq = (await db.execute(query)).scalar_one_or_none()
        if not pq:
            return False
        
        await db.delete(pq)
        paper.question_count = max(0, paper.question_count - 1)
        await db.flush()
        return True
    
    @staticmethod
    async def get_paper_questions(
        db: AsyncSession,
        paper_id: int
    ) -> List[ExamQuestion]:
        """获取试卷题目列表"""
        query = select(ExamPaperQuestion).where(
            ExamPaperQuestion.paper_id == paper_id
        ).order_by(ExamPaperQuestion.sort_order)
        
        result = await db.execute(query)
        paper_questions = result.scalars().all()
        
        questions = []
        for pq in paper_questions:
            q = await ExamService.get_question_by_id(db, pq.question_id)
            if q:
                # 附加排序信息
                q._sort_order = pq.sort_order
                q._paper_score = pq.score
                questions.append(q)
        
        return questions
    
    # ==================== 考试操作 ====================
    
    @staticmethod
    async def start_exam(
        db: AsyncSession,
        user_id: int,
        paper_id: int
    ) -> Optional[ExamRecord]:
        """开始考试"""
        paper = await ExamService.get_paper_by_id(db, paper_id, include_questions=True)
        if not paper:
            return None
        
        # 检查试卷状态
        if paper.status != "published":
            raise ValueError("试卷未发布")
        
        # 检查考试时间
        now = get_beijing_time()
        if paper.start_time and now < paper.start_time:
            raise ValueError("考试尚未开始")
        if paper.end_time and now > paper.end_time:
            raise ValueError("考试已结束")
        
        # 检查是否已有进行中的考试
        exist_query = select(ExamRecord).where(
            and_(
                ExamRecord.user_id == user_id,
                ExamRecord.paper_id == paper_id,
                ExamRecord.status.in_(["pending", "in_progress"])
            )
        )
        existing = (await db.execute(exist_query)).scalar_one_or_none()
        if existing:
            if existing.status == "pending":
                existing.status = "in_progress"
                existing.start_time = now
                await db.flush()
                await db.refresh(existing)
            return existing
        
        # 创建考试记录
        record = ExamRecord(
            user_id=user_id,
            paper_id=paper_id,
            status="in_progress",
            total_score=paper.total_score,
            start_time=now
        )
        db.add(record)
        
        # 更新参考人数
        paper.take_count += 1
        
        await db.flush()
        await db.refresh(record)
        
        logger.info(f"开始考试: record_id={record.id}, user_id={user_id}, paper_id={paper_id}")
        return record
    
    @staticmethod
    async def save_answer(
        db: AsyncSession,
        record_id: int,
        user_id: int,
        question_id: int,
        answer: str
    ) -> Optional[ExamAnswer]:
        """保存答案"""
        record = await ExamService.get_record_by_id(db, record_id, user_id)
        if not record or record.status != "in_progress":
            return None
        
        # 查找或创建答题记录
        query = select(ExamAnswer).where(
            and_(
                ExamAnswer.record_id == record_id,
                ExamAnswer.question_id == question_id
            )
        )
        exam_answer = (await db.execute(query)).scalar_one_or_none()
        
        if exam_answer:
            exam_answer.user_answer = answer
        else:
            exam_answer = ExamAnswer(
                record_id=record_id,
                question_id=question_id,
                user_answer=answer
            )
            db.add(exam_answer)
        
        await db.flush()
        await db.refresh(exam_answer)
        return exam_answer
    
    @staticmethod
    async def submit_exam(
        db: AsyncSession,
        record_id: int,
        user_id: int,
        answers: List[ExamSubmitAnswer]
    ) -> Optional[ExamRecord]:
        """提交考试"""
        record = await ExamService.get_record_by_id(db, record_id, user_id, include_answers=True)
        if not record or record.status not in ["pending", "in_progress"]:
            return None
        
        paper = await ExamService.get_paper_by_id(db, record.paper_id)
        if not paper:
            return None
        
        now = get_beijing_time()
        
        # 保存所有答案
        for ans in answers:
            await ExamService.save_answer(db, record_id, user_id, ans.question_id, ans.answer)
        
        # 获取试卷题目进行自动阅卷
        questions = await ExamService.get_paper_questions(db, record.paper_id)
        
        # 获取所有答案
        answer_query = select(ExamAnswer).where(ExamAnswer.record_id == record_id)
        all_answers = list((await db.execute(answer_query)).scalars().all())
        answer_map = {a.question_id: a for a in all_answers}
        
        total_score = 0
        correct_count = 0
        wrong_count = 0
        unanswered_count = 0
        need_manual_grade = False
        
        for question in questions:
            q_score = getattr(question, '_paper_score', question.score) or question.score
            exam_answer = answer_map.get(question.id)
            
            if not exam_answer or not exam_answer.user_answer:
                unanswered_count += 1
                if exam_answer:
                    exam_answer.is_correct = False
                    exam_answer.score = 0
                    exam_answer.max_score = q_score
                    exam_answer.correct_answer = question.answer
                continue
            
            exam_answer.correct_answer = question.answer
            exam_answer.max_score = q_score
            
            # 自动阅卷（客观题）
            if question.question_type in ["single", "multiple", "judge"]:
                user_ans = exam_answer.user_answer.strip().upper()
                correct_ans = question.answer.strip().upper()
                
                if question.question_type == "multiple":
                    # 多选题：答案需要排序比较
                    user_set = set(user_ans.replace(",", "").replace(" ", ""))
                    correct_set = set(correct_ans.replace(",", "").replace(" ", ""))
                    is_correct = user_set == correct_set
                else:
                    is_correct = user_ans == correct_ans
                
                exam_answer.is_correct = is_correct
                if is_correct:
                    exam_answer.score = q_score
                    total_score += q_score
                    correct_count += 1
                else:
                    exam_answer.score = 0
                    wrong_count += 1
            else:
                # 主观题需要人工阅卷
                need_manual_grade = True
                exam_answer.is_correct = None
                exam_answer.score = 0
        
        # 更新考试记录
        record.status = "submitted" if need_manual_grade else "graded"
        record.score = total_score
        record.correct_count = correct_count
        record.wrong_count = wrong_count
        record.unanswered_count = unanswered_count
        record.submit_time = now
        record.used_seconds = int((now - record.start_time).total_seconds()) if record.start_time else 0
        
        if not need_manual_grade:
            record.is_passed = total_score >= paper.pass_score
            record.graded_at = now
        
        await db.flush()
        await db.refresh(record)
        
        logger.info(f"提交考试: record_id={record_id}, score={total_score}")
        return record
    
    @staticmethod
    async def get_record_by_id(
        db: AsyncSession,
        record_id: int,
        user_id: Optional[int] = None,
        include_answers: bool = False
    ) -> Optional[ExamRecord]:
        """获取考试记录"""
        query = select(ExamRecord).where(ExamRecord.id == record_id)
        if user_id:
            query = query.where(ExamRecord.user_id == user_id)
        if include_answers:
            query = query.options(selectinload(ExamRecord.answers))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_record_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        paper_id: Optional[int] = None,
        status: Optional[str] = None
    ) -> Tuple[List[ExamRecord], int]:
        """获取考试记录列表"""
        conditions = [ExamRecord.user_id == user_id]
        
        if paper_id:
            conditions.append(ExamRecord.paper_id == paper_id)
        if status:
            conditions.append(ExamRecord.status == status)
        
        # 查询总数
        count_query = select(func.count(ExamRecord.id)).where(and_(*conditions))
        total = (await db.execute(count_query)).scalar() or 0
        
        # 查询数据
        query = select(ExamRecord).where(and_(*conditions))
        query = query.order_by(ExamRecord.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        
        return list(result.scalars().all()), total
    
    # ==================== 阅卷操作 ====================
    
    @staticmethod
    async def get_pending_records(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[ExamRecord], int]:
        """获取待阅卷记录（管理员/出卷人）"""
        # 获取用户创建的试卷ID
        paper_query = select(ExamPaper.id).where(ExamPaper.user_id == user_id)
        paper_ids = [p for p in (await db.execute(paper_query)).scalars().all()]
        
        if not paper_ids:
            return [], 0
        
        conditions = [
            ExamRecord.paper_id.in_(paper_ids),
            ExamRecord.status == "submitted"
        ]
        
        # 查询总数
        count_query = select(func.count(ExamRecord.id)).where(and_(*conditions))
        total = (await db.execute(count_query)).scalar() or 0
        
        # 查询数据
        query = select(ExamRecord).where(and_(*conditions))
        query = query.order_by(ExamRecord.submit_time.asc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        
        return list(result.scalars().all()), total
    
    @staticmethod
    async def grade_record(
        db: AsyncSession,
        record_id: int,
        grader_id: int,
        grades: List[GradeAnswer],
        review_comment: Optional[str] = None
    ) -> Optional[ExamRecord]:
        """阅卷评分"""
        record = await ExamService.get_record_by_id(db, record_id, include_answers=True)
        if not record or record.status != "submitted":
            return None
        
        paper = await ExamService.get_paper_by_id(db, record.paper_id)
        if not paper:
            return None
        
        # 验证阅卷权限
        if paper.user_id != grader_id:
            return None
        
        # 获取答题记录映射
        answer_map = {a.question_id: a for a in record.answers}
        
        # 更新评分
        total_score = record.score or 0
        for grade in grades:
            answer = answer_map.get(grade.question_id)
            if answer:
                # 减去旧分数，加上新分数
                old_score = answer.score or 0
                total_score = total_score - old_score + grade.score
                
                answer.score = grade.score
                answer.is_correct = grade.score > 0
                if grade.comment:
                    answer.comment = grade.comment
        
        # 更新记录
        record.score = total_score
        record.is_passed = total_score >= paper.pass_score
        record.status = "graded"
        record.grader_id = grader_id
        record.graded_at = get_beijing_time()
        if review_comment:
            record.review_comment = review_comment
        
        await db.flush()
        await db.refresh(record)
        
        logger.info(f"完成阅卷: record_id={record_id}, score={total_score}")
        return record
    
    # ==================== 统计操作 ====================
    
    @staticmethod
    async def get_paper_statistics(
        db: AsyncSession,
        paper_id: int
    ) -> dict:
        """获取试卷统计"""
        # 获取所有已完成的记录
        query = select(ExamRecord).where(
            and_(
                ExamRecord.paper_id == paper_id,
                ExamRecord.status == "graded"
            )
        )
        records = list((await db.execute(query)).scalars().all())
        
        if not records:
            return {
                "take_count": 0,
                "pass_count": 0,
                "pass_rate": 0,
                "avg_score": 0,
                "max_score": 0,
                "min_score": 0
            }
        
        scores = [r.score for r in records if r.score is not None]
        pass_count = sum(1 for r in records if r.is_passed)
        
        return {
            "take_count": len(records),
            "pass_count": pass_count,
            "pass_rate": round(pass_count / len(records) * 100, 1) if records else 0,
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "max_score": max(scores) if scores else 0,
            "min_score": min(scores) if scores else 0
        }
    
    # ==================== 智能组卷 ====================
    
    @staticmethod
    async def smart_create_paper(
        db: AsyncSession,
        user_id: int,
        data: SmartPaperCreate
    ) -> Optional[ExamPaper]:
        """智能组卷：根据规则自动从题库抽取题目组成试卷"""
        # 创建试卷
        total_score = sum(rule.count * rule.score_per_question for rule in data.rules)
        
        paper = ExamPaper(
            user_id=user_id,
            title=data.title,
            description=data.description,
            total_score=total_score,
            pass_score=data.pass_score,
            duration=data.duration,
            shuffle_questions=data.shuffle_questions,
            shuffle_options=data.shuffle_options,
            status="draft"
        )
        db.add(paper)
        await db.flush()
        await db.refresh(paper)
        
        # 根据规则抽取题目
        question_count = 0
        sort_order = 0
        
        for rule in data.rules:
            # 构建查询条件
            conditions = [
                ExamQuestion.user_id == user_id,
                ExamQuestion.question_type == rule.question_type,
                ExamQuestion.is_active == True
            ]
            
            # 难度范围
            if rule.difficulty_range and len(rule.difficulty_range) == 2:
                conditions.append(ExamQuestion.difficulty >= rule.difficulty_range[0])
                conditions.append(ExamQuestion.difficulty <= rule.difficulty_range[1])
            
            # 指定题库
            if rule.bank_ids:
                conditions.append(ExamQuestion.bank_id.in_(rule.bank_ids))
            
            # 查询符合条件的题目
            query = select(ExamQuestion).where(and_(*conditions))
            result = await db.execute(query)
            candidates = list(result.scalars().all())
            
            # 随机抽取
            if len(candidates) < rule.count:
                logger.warning(f"智能组卷: {rule.question_type} 题目不足，需要 {rule.count}，实际 {len(candidates)}")
                selected = candidates
            else:
                selected = random.sample(candidates, rule.count)
            
            # 添加到试卷
            for question in selected:
                sort_order += 1
                pq = ExamPaperQuestion(
                    paper_id=paper.id,
                    question_id=question.id,
                    sort_order=sort_order,
                    score=rule.score_per_question
                )
                db.add(pq)
                question_count += 1
        
        paper.question_count = question_count
        await db.flush()
        await db.refresh(paper)
        
        logger.info(f"智能组卷完成: paper_id={paper.id}, question_count={question_count}")
        return paper
    
    # ==================== 题目批量导入 ====================
    
    @staticmethod
    async def batch_import_questions(
        db: AsyncSession,
        user_id: int,
        data: QuestionImportRequest
    ) -> Tuple[int, int]:
        """批量导入题目，返回(成功数, 失败数)"""
        success_count = 0
        fail_count = 0
        
        for item in data.questions:
            try:
                # 构建选项
                options = []
                for key, opt_field in [('A', item.option_a), ('B', item.option_b), 
                                       ('C', item.option_c), ('D', item.option_d),
                                       ('E', item.option_e), ('F', item.option_f)]:
                    if opt_field:
                        options.append({"key": key, "value": opt_field})
                
                question = ExamQuestion(
                    user_id=user_id,
                    bank_id=data.bank_id,
                    question_type=item.question_type,
                    title=item.title,
                    options=options if options else None,
                    answer=item.answer,
                    analysis=item.analysis,
                    score=item.score,
                    difficulty=item.difficulty,
                    is_active=True
                )
                db.add(question)
                success_count += 1
            except Exception as e:
                logger.error(f"导入题目失败: {e}")
                fail_count += 1
        
        # 更新题库计数
        if data.bank_id:
            await ExamService._update_bank_count(db, data.bank_id)
        
        await db.flush()
        logger.info(f"批量导入完成: 成功 {success_count}, 失败 {fail_count}")
        return success_count, fail_count
    
    # ==================== 错题本操作 ====================
    
    @staticmethod
    async def add_wrong_question(
        db: AsyncSession,
        user_id: int,
        question_id: int,
        paper_id: Optional[int],
        user_answer: str,
        correct_answer: str
    ) -> ExamWrongQuestion:
        """添加错题记录"""
        # 检查是否已存在
        query = select(ExamWrongQuestion).where(
            and_(
                ExamWrongQuestion.user_id == user_id,
                ExamWrongQuestion.question_id == question_id
            )
        )
        existing = (await db.execute(query)).scalar_one_or_none()
        
        if existing:
            # 更新错误次数
            existing.wrong_count += 1
            existing.user_answer = user_answer
            existing.correct_answer = correct_answer
            existing.last_wrong_at = get_beijing_time()
            if paper_id:
                existing.paper_id = paper_id
            await db.flush()
            return existing
        
        # 新增记录
        wrong = ExamWrongQuestion(
            user_id=user_id,
            question_id=question_id,
            paper_id=paper_id,
            user_answer=user_answer,
            correct_answer=correct_answer
        )
        db.add(wrong)
        await db.flush()
        await db.refresh(wrong)
        return wrong
    
    @staticmethod
    async def get_wrong_questions(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        question_type: Optional[str] = None
    ) -> Tuple[List[dict], int]:
        """获取用户错题列表"""
        conditions = [ExamWrongQuestion.user_id == user_id]
        
        # 查询总数
        count_query = select(func.count(ExamWrongQuestion.id)).where(and_(*conditions))
        total = (await db.execute(count_query)).scalar() or 0
        
        # 查询数据
        query = select(ExamWrongQuestion).where(and_(*conditions))
        query = query.options(selectinload(ExamWrongQuestion.question))
        query = query.order_by(ExamWrongQuestion.last_wrong_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        wrong_list = list(result.scalars().all())
        
        # 过滤题目类型
        items = []
        for wrong in wrong_list:
            if not wrong.question:
                continue
            if question_type and wrong.question.question_type != question_type:
                continue
            
            items.append({
                "id": wrong.id,
                "question_id": wrong.question_id,
                "question_type": wrong.question.question_type,
                "title": wrong.question.title,
                "options": wrong.question.options,
                "correct_answer": wrong.correct_answer,
                "user_answer": wrong.user_answer,
                "analysis": wrong.question.analysis,
                "paper_id": wrong.paper_id,
                "wrong_count": wrong.wrong_count,
                "last_wrong_at": wrong.last_wrong_at
            })
        
        return items, total
    
    @staticmethod
    async def delete_wrong_question(
        db: AsyncSession,
        wrong_id: int,
        user_id: int
    ) -> bool:
        """删除错题记录"""
        query = select(ExamWrongQuestion).where(
            and_(
                ExamWrongQuestion.id == wrong_id,
                ExamWrongQuestion.user_id == user_id
            )
        )
        wrong = (await db.execute(query)).scalar_one_or_none()
        if not wrong:
            return False
        await db.delete(wrong)
        await db.flush()
        return True
    
    @staticmethod
    async def clear_wrong_questions(
        db: AsyncSession,
        user_id: int
    ) -> int:
        """清空用户错题本"""
        from sqlalchemy import delete
        stmt = delete(ExamWrongQuestion).where(ExamWrongQuestion.user_id == user_id)
        result = await db.execute(stmt)
        return result.rowcount
    
    # ==================== 成绩排名 ====================
    
    @staticmethod
    async def get_paper_ranking(
        db: AsyncSession,
        paper_id: int,
        limit: int = 50
    ) -> dict:
        """获取试卷成绩排名"""
        paper = await ExamService.get_paper_by_id(db, paper_id)
        if not paper:
            return {}
        
        # 获取已完成的记录，按分数和用时排序
        query = select(ExamRecord).where(
            and_(
                ExamRecord.paper_id == paper_id,
                ExamRecord.status == "graded"
            )
        ).order_by(
            desc(ExamRecord.score),
            ExamRecord.used_seconds
        ).limit(limit)
        
        records = list((await db.execute(query)).scalars().all())
        
        # 统计
        scores = [r.score for r in records if r.score is not None]
        pass_count = sum(1 for r in records if r.is_passed)
        
        # 构建排名
        rankings = []
        for i, r in enumerate(records):
            rankings.append({
                "rank": i + 1,
                "user_id": r.user_id,
                "score": r.score or 0,
                "used_seconds": r.used_seconds,
                "submit_time": r.submit_time
            })
        
        return {
            "paper_id": paper_id,
            "paper_title": paper.title,
            "total_score": paper.total_score,
            "pass_score": paper.pass_score,
            "take_count": len(records),
            "pass_count": pass_count,
            "pass_rate": round(pass_count / len(records) * 100, 1) if records else 0,
            "avg_score": round(sum(scores) / len(scores), 1) if scores else 0,
            "rankings": rankings
        }
    
    # ==================== 提交考试增强（自动记录错题） ====================
    
    @staticmethod
    async def submit_exam_with_wrong_record(
        db: AsyncSession,
        record_id: int,
        user_id: int,
        answers: List[ExamSubmitAnswer]
    ) -> Optional[ExamRecord]:
        """提交考试并记录错题"""
        # 调用原有的提交逻辑
        record = await ExamService.submit_exam(db, record_id, user_id, answers)
        if not record:
            return None
        
        # 获取答题记录，记录错题
        answer_query = select(ExamAnswer).where(ExamAnswer.record_id == record_id)
        all_answers = list((await db.execute(answer_query)).scalars().all())
        
        for ans in all_answers:
            if ans.is_correct == False:  # 仅记录明确错误的题目
                await ExamService.add_wrong_question(
                    db, user_id, ans.question_id, record.paper_id,
                    ans.user_answer or "", ans.correct_answer or ""
                )
        
        return record
    
    # ==================== 作弊日志 ====================
    
    @staticmethod
    async def add_cheat_log(
        db: AsyncSession,
        user_id: int,
        data: CheatLogCreate
    ) -> ExamCheatLog:
        """记录作弊行为"""
        log = ExamCheatLog(
            record_id=data.record_id,
            user_id=user_id,
            action=data.action,
            count=data.count
        )
        db.add(log)
        await db.flush()
        logger.warning(f"作弊记录: user={user_id}, record={data.record_id}, action={data.action}, count={data.count}")
        return log
    
    @staticmethod
    async def get_cheat_logs_by_record(
        db: AsyncSession,
        record_id: int
    ) -> List[ExamCheatLog]:
        """获取考试记录的作弊日志"""
        query = select(ExamCheatLog).where(
            ExamCheatLog.record_id == record_id
        ).order_by(ExamCheatLog.created_at)
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_user_cheat_summary(
        db: AsyncSession,
        user_id: int
    ) -> dict:
        """获取用户作弊统计"""
        query = select(
            func.count(ExamCheatLog.id).label('total_count'),
            func.count(func.distinct(ExamCheatLog.record_id)).label('exam_count')
        ).where(ExamCheatLog.user_id == user_id)
        
        result = (await db.execute(query)).one_or_none()
        
        return {
            "total_count": result[0] if result else 0,
            "exam_count": result[1] if result else 0
        }
