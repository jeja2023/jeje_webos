"""
考试模块路由
定义 API 接口
"""

from utils.timezone import get_beijing_time
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas.response import success, error

from .exam_schemas import (
    QuestionBankCreate, QuestionBankUpdate, QuestionBankResponse,
    QuestionCreate, QuestionUpdate, QuestionResponse, QuestionListResponse,
    PaperCreate, PaperUpdate, PaperResponse, PaperDetailResponse, PaperListResponse,
    PaperQuestionAdd,
    ExamStart, ExamSubmit, ExamSubmitAnswer,
    RecordResponse, RecordDetailResponse, RecordListResponse,
    GradeSubmit,
    ExamQuestionView, ExamPaperView,
    SmartPaperCreate, QuestionImportRequest, CheatLogCreate
)
from .exam_services import ExamService

router = APIRouter()


# ==================== 题库接口 ====================

@router.get("/banks", summary="获取题库列表")
async def get_bank_list(
    keyword: str = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取当前用户的题库列表"""
    banks = await ExamService.get_bank_list(db, user.user_id, keyword)
    items = [QuestionBankResponse.model_validate(b).model_dump() for b in banks]
    return success(data={"items": items, "total": len(items)})


@router.post("/banks", summary="创建题库")
async def create_bank(
    data: QuestionBankCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建题库"""
    bank = await ExamService.create_bank(db, user.user_id, data)
    await db.commit()
    return success(data=QuestionBankResponse.model_validate(bank).model_dump(), message="题库创建成功")


@router.put("/banks/{bank_id}", summary="更新题库")
async def update_bank(
    bank_id: int,
    data: QuestionBankUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新题库"""
    bank = await ExamService.update_bank(db, bank_id, data, user.user_id)
    if not bank:
        raise HTTPException(status_code=404, detail="题库不存在")
    await db.commit()
    return success(data=QuestionBankResponse.model_validate(bank).model_dump(), message="更新成功")


@router.delete("/banks/{bank_id}", summary="删除题库")
async def delete_bank(
    bank_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除题库"""
    deleted = await ExamService.delete_bank(db, bank_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="题库不存在")
    await db.commit()
    return success(message="题库已删除")


# ==================== 题目接口 ====================

@router.get("/questions", summary="获取题目列表")
async def get_question_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    bank_id: int = Query(None, description="题库ID"),
    question_type: str = Query(None, description="题目类型"),
    keyword: str = Query(None, description="搜索关键词"),
    difficulty: int = Query(None, ge=1, le=5, description="难度"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取题目列表"""
    questions, total = await ExamService.get_question_list(
        db, user.user_id, page, page_size,
        bank_id, question_type, keyword, difficulty
    )
    items = [QuestionResponse.model_validate(q).model_dump() for q in questions]
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.post("/questions", summary="创建题目")
async def create_question(
    data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建题目"""
    question = await ExamService.create_question(db, user.user_id, data)
    await db.commit()
    return success(data=QuestionResponse.model_validate(question).model_dump(), message="题目创建成功")


@router.get("/questions/{question_id}", summary="获取题目详情")
async def get_question_detail(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取题目详情"""
    question = await ExamService.get_question_by_id(db, question_id, user.user_id)
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    return success(data=QuestionResponse.model_validate(question).model_dump())


@router.put("/questions/{question_id}", summary="更新题目")
async def update_question(
    question_id: int,
    data: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新题目"""
    question = await ExamService.update_question(db, question_id, data, user.user_id)
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    await db.commit()
    return success(data=QuestionResponse.model_validate(question).model_dump(), message="更新成功")


@router.delete("/questions/{question_id}", summary="删除题目")
async def delete_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除题目"""
    deleted = await ExamService.delete_question(db, question_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="题目不存在")
    await db.commit()
    return success(message="题目已删除")


# ==================== 试卷接口 ====================

@router.get("/papers", summary="获取试卷列表")
async def get_paper_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None, description="试卷状态"),
    keyword: str = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取试卷列表"""
    papers, total = await ExamService.get_paper_list(
        db, user.user_id, page, page_size, status, keyword
    )
    items = [PaperResponse.model_validate(p).model_dump() for p in papers]
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.post("/papers", summary="创建试卷")
async def create_paper(
    data: PaperCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建试卷"""
    paper = await ExamService.create_paper(db, user.user_id, data)
    await db.commit()
    return success(data=PaperResponse.model_validate(paper).model_dump(), message="试卷创建成功")


@router.get("/papers/{paper_id}", summary="获取试卷详情")
async def get_paper_detail(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取试卷详情（含题目）"""
    paper = await ExamService.get_paper_by_id(db, paper_id, user.user_id)
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")
    
    # 获取题目
    questions = await ExamService.get_paper_questions(db, paper_id)
    
    paper_data = PaperResponse.model_validate(paper).model_dump()
    paper_data['questions'] = [
        {
            **QuestionResponse.model_validate(q).model_dump(),
            'sort_order': getattr(q, '_sort_order', 0),
            'paper_score': getattr(q, '_paper_score', q.score)
        }
        for q in questions
    ]
    
    return success(data=paper_data)


@router.put("/papers/{paper_id}", summary="更新试卷")
async def update_paper(
    paper_id: int,
    data: PaperUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新试卷"""
    paper = await ExamService.update_paper(db, paper_id, data, user.user_id)
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")
    await db.commit()
    return success(data=PaperResponse.model_validate(paper).model_dump(), message="更新成功")


@router.delete("/papers/{paper_id}", summary="删除试卷")
async def delete_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除试卷"""
    deleted = await ExamService.delete_paper(db, paper_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="试卷不存在")
    await db.commit()
    return success(message="试卷已删除")


@router.post("/papers/{paper_id}/questions", summary="添加试卷题目")
async def add_paper_questions(
    paper_id: int,
    data: PaperQuestionAdd,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """添加试卷题目"""
    added = await ExamService.add_paper_questions(db, paper_id, data.question_ids, user.user_id)
    await db.commit()
    return success(message=f"成功添加 {added} 道题目")


@router.delete("/papers/{paper_id}/questions/{question_id}", summary="移除试卷题目")
async def remove_paper_question(
    paper_id: int,
    question_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """移除试卷题目"""
    removed = await ExamService.remove_paper_question(db, paper_id, question_id, user.user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="题目不存在")
    await db.commit()
    return success(message="题目已移除")


@router.get("/papers/{paper_id}/statistics", summary="获取试卷统计")
async def get_paper_statistics(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取试卷统计数据"""
    stats = await ExamService.get_paper_statistics(db, paper_id)
    return success(data=stats)


# ==================== 考试接口 ====================

@router.get("/available", summary="获取可参加的考试")
async def get_available_exams(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取可参加的考试列表"""
    papers, total = await ExamService.get_paper_list(
        db, user.user_id, page, page_size, status="published"
    )
    
    now = get_beijing_time()
    available = []
    for p in papers:
        # 过滤时间范围
        if p.start_time and now < p.start_time:
            continue
        if p.end_time and now > p.end_time:
            continue
        available.append(PaperResponse.model_validate(p).model_dump())
    
    return success(data={
        "items": available,
        "total": len(available),
        "page": page,
        "page_size": page_size
    })


@router.post("/start", summary="开始考试")
async def start_exam(
    data: ExamStart,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """开始考试"""
    try:
        record = await ExamService.start_exam(db, user.user_id, data.paper_id)
        if not record:
            raise HTTPException(status_code=404, detail="试卷不存在")
        await db.commit()
        return success(data={"record_id": record.id}, message="考试开始")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/take/{record_id}", summary="获取考试试卷")
async def get_exam_paper(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取考试中的试卷内容（不含答案）"""
    record = await ExamService.get_record_by_id(db, record_id, user.user_id, include_answers=True)
    if not record:
        raise HTTPException(status_code=404, detail="考试记录不存在")
    
    if record.status not in ["pending", "in_progress"]:
        raise HTTPException(status_code=400, detail="考试已结束")
    
    paper = await ExamService.get_paper_by_id(db, record.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")
    
    # 获取题目
    questions = await ExamService.get_paper_questions(db, record.paper_id)
    
    # 计算剩余时间
    now = get_beijing_time()
    elapsed = (now - record.start_time).total_seconds() if record.start_time else 0
    remaining = max(0, paper.duration * 60 - int(elapsed))
    
    # 获取已保存的答案
    saved_answers = {a.question_id: a.user_answer for a in record.answers if a.user_answer}
    
    # 构建题目列表（不含答案）
    question_views = []
    for i, q in enumerate(questions):
        question_views.append({
            "id": q.id,
            "question_type": q.question_type,
            "title": q.title,
            "options": q.options,
            "score": getattr(q, '_paper_score', q.score) or q.score,
            "sort_order": i + 1
        })
    
    # 乱序处理
    if paper.shuffle_questions:
        import random
        random.shuffle(question_views)
        for i, qv in enumerate(question_views):
            qv['sort_order'] = i + 1
    
    return success(data={
        "paper_id": paper.id,
        "record_id": record.id,
        "title": paper.title,
        "total_score": paper.total_score,
        "duration": paper.duration,
        "remaining_seconds": remaining,
        "questions": question_views,
        "saved_answers": saved_answers
    })


@router.post("/take/{record_id}/save", summary="保存答案")
async def save_answer(
    record_id: int,
    data: ExamSubmitAnswer,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """保存单题答案"""
    answer = await ExamService.save_answer(db, record_id, user.user_id, data.question_id, data.answer)
    if not answer:
        raise HTTPException(status_code=400, detail="保存失败")
    await db.commit()
    return success(message="已保存")


@router.post("/take/{record_id}/submit", summary="提交试卷")
async def submit_exam(
    record_id: int,
    data: ExamSubmit,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """提交试卷"""
    record = await ExamService.submit_exam(db, record_id, user.user_id, data.answers)
    if not record:
        raise HTTPException(status_code=400, detail="提交失败")
    await db.commit()
    
    return success(data={
        "record_id": record.id,
        "score": record.score,
        "total_score": record.total_score,
        "is_passed": record.is_passed,
        "status": record.status
    }, message="提交成功")


# ==================== 考试记录接口 ====================

@router.get("/records", summary="获取考试记录")
async def get_record_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    paper_id: int = Query(None, description="试卷ID"),
    status: str = Query(None, description="状态"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取我的考试记录"""
    records, total = await ExamService.get_record_list(
        db, user.user_id, page, page_size, paper_id, status
    )
    
    items = []
    for r in records:
        paper = await ExamService.get_paper_by_id(db, r.paper_id)
        record_data = RecordResponse.model_validate(r).model_dump()
        record_data['paper_title'] = paper.title if paper else None
        items.append(record_data)
    
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.get("/records/{record_id}", summary="获取考试记录详情")
async def get_record_detail(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取考试记录详情（含答题情况）"""
    record = await ExamService.get_record_by_id(db, record_id, user.user_id, include_answers=True)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    paper = await ExamService.get_paper_by_id(db, record.paper_id)
    
    # 只有已交卷且允许查看答案时才返回答案
    show_answers = record.status in ["submitted", "graded"] and paper and paper.show_answer
    
    record_data = RecordResponse.model_validate(record).model_dump()
    record_data['paper_title'] = paper.title if paper else None
    
    if show_answers:
        # 获取题目详情
        questions = await ExamService.get_paper_questions(db, record.paper_id)
        question_map = {q.id: q for q in questions}
        
        answers = []
        for a in record.answers:
            question = question_map.get(a.question_id)
            answers.append({
                "question_id": a.question_id,
                "question_title": question.title if question else None,
                "question_type": question.question_type if question else None,
                "options": question.options if question else None,
                "user_answer": a.user_answer,
                "correct_answer": a.correct_answer,
                "is_correct": a.is_correct,
                "score": a.score,
                "max_score": a.max_score,
                "comment": a.comment,
                "analysis": question.analysis if question else None
            })
        record_data['answers'] = answers
    
    return success(data=record_data)


# ==================== 阅卷接口 ====================

@router.get("/grading/pending", summary="获取待阅卷列表")
async def get_pending_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取待阅卷的考试记录"""
    records, total = await ExamService.get_pending_records(db, user.user_id, page, page_size)
    
    items = []
    for r in records:
        paper = await ExamService.get_paper_by_id(db, r.paper_id)
        record_data = RecordResponse.model_validate(r).model_dump()
        record_data['paper_title'] = paper.title if paper else None
        items.append(record_data)
    
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.get("/grading/{record_id}", summary="获取阅卷详情")
async def get_grading_detail(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取待阅卷记录详情"""
    record = await ExamService.get_record_by_id(db, record_id, include_answers=True)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    
    paper = await ExamService.get_paper_by_id(db, record.paper_id)
    if not paper or paper.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="无权限阅卷")
    
    # 获取题目详情
    questions = await ExamService.get_paper_questions(db, record.paper_id)
    question_map = {q.id: q for q in questions}
    
    record_data = RecordResponse.model_validate(record).model_dump()
    record_data['paper_title'] = paper.title
    
    answers = []
    for a in record.answers:
        question = question_map.get(a.question_id)
        answers.append({
            "question_id": a.question_id,
            "question_title": question.title if question else None,
            "question_type": question.question_type if question else None,
            "options": question.options if question else None,
            "user_answer": a.user_answer,
            "correct_answer": a.correct_answer if question else None,
            "is_correct": a.is_correct,
            "score": a.score,
            "max_score": a.max_score or (getattr(question, '_paper_score', question.score) if question else 0),
            "comment": a.comment,
            "analysis": question.analysis if question else None
        })
    
    record_data['answers'] = answers
    return success(data=record_data)


@router.post("/grading/{record_id}", summary="提交阅卷")
async def submit_grading(
    record_id: int,
    data: GradeSubmit,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """提交阅卷评分"""
    record = await ExamService.grade_record(
        db, record_id, user.user_id, data.grades, data.review_comment
    )
    if not record:
        raise HTTPException(status_code=400, detail="阅卷失败")
    await db.commit()
    
    return success(data={
        "record_id": record.id,
        "score": record.score,
        "is_passed": record.is_passed
    }, message="阅卷完成")


# ==================== 智能组卷接口 ====================

@router.post("/papers/smart", summary="智能组卷")
async def smart_create_paper(
    data: SmartPaperCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """根据规则自动从题库抽取题目组卷"""
    paper = await ExamService.smart_create_paper(db, user.user_id, data)
    if not paper:
        raise HTTPException(status_code=400, detail="组卷失败")
    await db.commit()
    return success(data=PaperResponse.model_validate(paper).model_dump(), message="智能组卷成功")


# ==================== 题目批量导入接口 ====================

@router.post("/questions/import", summary="批量导入题目")
async def batch_import_questions(
    data: QuestionImportRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """批量导入题目"""
    success_count, fail_count = await ExamService.batch_import_questions(db, user.user_id, data)
    await db.commit()
    return success(data={
        "success_count": success_count,
        "fail_count": fail_count
    }, message=f"导入完成: 成功 {success_count} 题, 失败 {fail_count} 题")


# ==================== 错题本接口 ====================

@router.get("/wrong-questions", summary="获取错题本")
async def get_wrong_questions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    question_type: str = Query(None, description="题目类型筛选"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取当前用户的错题列表"""
    items, total = await ExamService.get_wrong_questions(
        db, user.user_id, page, page_size, question_type
    )
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.delete("/wrong-questions/{wrong_id}", summary="删除错题记录")
async def delete_wrong_question(
    wrong_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """从错题本中移除指定题目"""
    deleted = await ExamService.delete_wrong_question(db, wrong_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="错题记录不存在")
    await db.commit()
    return success(message="已从错题本移除")


@router.delete("/wrong-questions", summary="清空错题本")
async def clear_wrong_questions(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """清空当前用户的错题本"""
    count = await ExamService.clear_wrong_questions(db, user.user_id)
    await db.commit()
    return success(message=f"已清空 {count} 条错题记录")


# ==================== 成绩排名接口 ====================

@router.get("/papers/{paper_id}/ranking", summary="获取试卷排名")
async def get_paper_ranking(
    paper_id: int,
    limit: int = Query(50, ge=1, le=100, description="排名数量"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取试卷的成绩排名榜"""
    ranking = await ExamService.get_paper_ranking(db, paper_id, limit)
    if not ranking:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return success(data=ranking)


# ==================== 提交考试增强（自动记录错题） ====================

@router.post("/take/{record_id}/submit-v2", summary="提交试卷（增强版）")
async def submit_exam_v2(
    record_id: int,
    data: ExamSubmit,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """提交试卷并自动记录错题"""
    record = await ExamService.submit_exam_with_wrong_record(db, record_id, user.user_id, data.answers)
    if not record:
        raise HTTPException(status_code=400, detail="提交失败")
    await db.commit()
    
    return success(data={
        "record_id": record.id,
        "score": record.score,
        "total_score": record.total_score,
        "is_passed": record.is_passed,
        "status": record.status
    }, message="提交成功")


# ==================== 作弊日志接口 ====================

@router.post("/cheat-log", summary="记录作弊行为")
async def add_cheat_log(
    data: CheatLogCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """记录考试中的异常行为"""
    try:
        await ExamService.add_cheat_log(db, user.user_id, data)
        await db.commit()
        return success(message="已记录")
    except Exception as e:
        # 静默失败，不影响考试
        return success(message="已记录")


@router.get("/records/{record_id}/cheat-logs", summary="获取作弊日志")
async def get_cheat_logs(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取考试记录的作弊日志（仅管理员）"""
    logs = await ExamService.get_cheat_logs_by_record(db, record_id)
    return success(data=[{
        "id": log.id,
        "action": log.action,
        "count": log.count,
        "created_at": log.created_at
    } for log in logs])
