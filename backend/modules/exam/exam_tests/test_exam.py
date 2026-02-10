# -*- coding: utf-8 -*-
"""
考试模块测试
覆盖：模型、Schema、题库 CRUD、题目 CRUD、试卷 CRUD、考试流程、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.exam.exam_models import ExamQuestionBank, ExamQuestion, ExamPaper, ExamRecord
from modules.exam.exam_schemas import QuestionBankCreate, QuestionCreate, PaperCreate


# ==================== 模型测试 ====================
class TestExamModels:
    def test_bank_model(self):
        assert ExamQuestionBank.__tablename__ == "exam_question_banks"
    def test_question_model(self):
        assert ExamQuestion.__tablename__ == "exam_questions"
    def test_paper_model(self):
        assert ExamPaper.__tablename__ == "exam_papers"
    def test_record_model(self):
        assert ExamRecord.__tablename__ == "exam_records"


# ==================== 服务层测试 ====================
class TestExamService:
    @pytest.mark.asyncio
    async def test_create_bank(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(
            name="Python基础题库", description="基础题目"
        ))
        assert bank.id is not None
        assert bank.name == "Python基础题库"

    @pytest.mark.asyncio
    async def test_get_bank_list(self, db_session):
        from modules.exam.exam_services import ExamService
        await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="题库1"))
        banks = await ExamService.get_bank_list(db_session, user_id=1)
        assert len(banks) >= 1

    @pytest.mark.asyncio
    async def test_create_question_single(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="题库"))
        q = await ExamService.create_question(db_session, user_id=1, data=QuestionCreate(
            bank_id=bank.id, question_type="single", title="Python是什么类型的语言?",
            options=[{"key": "A", "value": "编译型"}, {"key": "B", "value": "解释型"}],
            answer="B", score=5
        ))
        assert q.id is not None
        assert q.question_type == "single"

    @pytest.mark.asyncio
    async def test_create_question_judge(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="判断题库"))
        q = await ExamService.create_question(db_session, user_id=1, data=QuestionCreate(
            bank_id=bank.id, question_type="judge", title="Python是解释型语言", answer="true", score=2
        ))
        assert q.question_type == "judge"

    @pytest.mark.asyncio
    async def test_get_question_list(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="列表题库"))
        await ExamService.create_question(db_session, user_id=1, data=QuestionCreate(
            bank_id=bank.id, question_type="judge", title="题目1", answer="true", score=1
        ))
        questions, total = await ExamService.get_question_list(db_session, user_id=1, bank_id=bank.id)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_create_paper(self, db_session):
        from modules.exam.exam_services import ExamService
        paper = await ExamService.create_paper(db_session, user_id=1, data=PaperCreate(
            title="期中考试", description="测试", duration=60, pass_score=60
        ))
        assert paper.id is not None
        assert paper.title == "期中考试"

    @pytest.mark.asyncio
    async def test_add_paper_questions(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="试卷题库"))
        q1 = await ExamService.create_question(db_session, user_id=1, data=QuestionCreate(
            bank_id=bank.id, question_type="judge", title="Q1", answer="true", score=5
        ))
        q2 = await ExamService.create_question(db_session, user_id=1, data=QuestionCreate(
            bank_id=bank.id, question_type="judge", title="Q2", answer="false", score=5
        ))
        paper = await ExamService.create_paper(db_session, user_id=1, data=PaperCreate(
            title="组卷测试", duration=30, pass_score=5
        ))
        result = await ExamService.add_paper_questions(db_session, paper.id, [q1.id, q2.id], user_id=1)
        assert result  # 返回添加的题目数量

    @pytest.mark.asyncio
    async def test_delete_bank(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="待删除"))
        result = await ExamService.delete_bank(db_session, bank.id, user_id=1)
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_question(self, db_session):
        from modules.exam.exam_services import ExamService
        bank = await ExamService.create_bank(db_session, user_id=1, data=QuestionBankCreate(name="删除题目库"))
        q = await ExamService.create_question(db_session, user_id=1, data=QuestionCreate(
            bank_id=bank.id, question_type="judge", title="待删除", answer="true", score=1
        ))
        result = await ExamService.delete_question(db_session, q.id, user_id=1)
        assert result is True


# ==================== API 路由测试 ====================
@pytest.mark.asyncio
class TestExamBankAPI:
    async def test_get_banks(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/exam/banks")
        assert resp.status_code == 200

    async def test_create_bank(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/exam/banks", json={
            "name": "API题库", "description": "API测试"
        })
        assert resp.status_code == 200

    async def test_delete_bank(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/exam/banks", json={"name": "待删除API题库"})
        bid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/exam/banks/{bid}")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestExamQuestionAPI:
    async def _create_bank(self, client):
        r = await client.post("/api/v1/exam/banks", json={"name": "题目测试题库"})
        return r.json()["data"]["id"]

    async def test_get_questions(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/exam/questions")
        assert resp.status_code == 200

    async def test_create_question(self, admin_client: AsyncClient):
        bid = await self._create_bank(admin_client)
        resp = await admin_client.post("/api/v1/exam/questions", json={
            "bank_id": bid, "question_type": "single", "title": "1+1=?",
            "options": [{"key": "A", "value": "1"}, {"key": "B", "value": "2"}],
            "answer": "B", "score": 5
        })
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestExamPaperAPI:
    async def test_get_papers(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/exam/papers")
        assert resp.status_code == 200

    async def test_create_paper(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/exam/papers", json={
            "title": "API试卷", "duration": 60, "pass_score": 60
        })
        assert resp.status_code == 200

    async def test_paper_lifecycle(self, admin_client: AsyncClient):
        """测试试卷完整生命周期"""
        cr = await admin_client.post("/api/v1/exam/papers", json={
            "title": "生命周期试卷", "duration": 30, "pass_score": 50
        })
        pid = cr.json()["data"]["id"]
        # 查看
        get_r = await admin_client.get(f"/api/v1/exam/papers/{pid}")
        assert get_r.status_code == 200
        # 更新
        up_r = await admin_client.put(f"/api/v1/exam/papers/{pid}", json={"title": "更新试卷"})
        assert up_r.status_code == 200
        # 删除
        del_r = await admin_client.delete(f"/api/v1/exam/papers/{pid}")
        assert del_r.status_code == 200

    async def test_get_records(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/exam/records")
        assert resp.status_code == 200


class TestExamManifest:
    def test_manifest(self):
        from modules.exam.exam_manifest import manifest
        assert manifest.id == "exam"
        assert manifest.enabled is True
