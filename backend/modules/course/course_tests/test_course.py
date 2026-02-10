# -*- coding: utf-8 -*-
"""
课程模块测试
覆盖：模型、服务层 CRUD、学习进度、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.course.course_models import Course, CourseChapter, CourseEnrollment
from modules.course.course_schemas import CourseCreate, ChapterCreate


# ==================== 模型测试 ====================
class TestCourseModels:
    def test_course_model(self):
        assert "course" in Course.__tablename__
    def test_chapter_model(self):
        assert "chapter" in CourseChapter.__tablename__
    def test_enrollment_model(self):
        assert "enrollment" in CourseEnrollment.__tablename__


# ==================== 服务层测试 ====================
class TestCourseService:
    @pytest.mark.asyncio
    async def test_create_course(self, db_session):
        from modules.course.course_services import CourseService
        course = await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="Python入门", description="Python基础教程", category="编程"
        ))
        assert course.id is not None
        assert course.title == "Python入门"

    @pytest.mark.asyncio
    async def test_get_course_list(self, db_session):
        from modules.course.course_services import CourseService
        await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="课程1", description="描述1"
        ))
        courses, total = await CourseService.get_course_list(db_session, user_id=1, only_published=False)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_update_course(self, db_session):
        from modules.course.course_services import CourseService
        from modules.course.course_schemas import CourseUpdate
        course = await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="原始课程", description="描述"
        ))
        updated = await CourseService.update_course(db_session, course.id, data=CourseUpdate(title="更新课程"))
        assert updated.title == "更新课程"

    @pytest.mark.asyncio
    async def test_delete_course(self, db_session):
        from modules.course.course_services import CourseService
        course = await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="待删除", description="描述"
        ))
        result = await CourseService.delete_course(db_session, course.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_create_chapter(self, db_session):
        from modules.course.course_services import CourseService, ChapterService
        course = await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="章节测试", description="描述"
        ))
        chapter = await ChapterService.create_chapter(db_session, course.id, data=ChapterCreate(
            title="第一章", content="内容"
        ))
        assert chapter.id is not None
        assert chapter.title == "第一章"

    @pytest.mark.asyncio
    async def test_get_chapters_by_course(self, db_session):
        from modules.course.course_services import CourseService, ChapterService
        course = await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="章节列表测试", description="描述"
        ))
        await ChapterService.create_chapter(db_session, course.id, data=ChapterCreate(title="C1", content="c1"))
        await ChapterService.create_chapter(db_session, course.id, data=ChapterCreate(title="C2", content="c2"))
        chapters = await ChapterService.get_chapters_by_course(db_session, course.id)
        assert len(chapters) >= 2

    @pytest.mark.asyncio
    async def test_enroll_course(self, db_session):
        from modules.course.course_services import CourseService, EnrollmentService
        from modules.course.course_schemas import CourseUpdate
        course = await CourseService.create_course(db_session, user_id=1, data=CourseCreate(
            title="报名测试", description="描述"
        ))
        await CourseService.update_course(db_session, course.id, data=CourseUpdate(is_published=True))
        enrollment = await EnrollmentService.enroll_course(db_session, user_id=2, course_id=course.id)
        assert enrollment is not None

    @pytest.mark.asyncio
    async def test_learning_stats(self, db_session):
        from modules.course.course_services import EnrollmentService
        stats = await EnrollmentService.get_learning_stats(db_session, user_id=1)
        assert isinstance(stats, dict)


# ==================== API 路由测试 ====================
@pytest.mark.asyncio
class TestCourseAPI:
    async def test_create_course(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/course/create", json={
            "title": "API课程", "description": "API描述"
        })
        assert resp.status_code == 200

    async def test_get_course_list(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/course/list")
        assert resp.status_code == 200

    async def test_get_my_courses(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/course/my")
        assert resp.status_code == 200

    async def test_course_lifecycle(self, admin_client: AsyncClient):
        """测试课程完整生命周期"""
        # 创建
        cr = await admin_client.post("/api/v1/course/create", json={
            "title": "生命周期", "description": "测试"
        })
        assert cr.status_code == 200
        cid = cr.json()["data"]["id"]
        # 查看
        get_r = await admin_client.get(f"/api/v1/course/{cid}")
        assert get_r.status_code == 200
        # 更新
        up_r = await admin_client.put(f"/api/v1/course/{cid}", json={"title": "已更新"})
        assert up_r.status_code == 200
        # 创建章节
        ch_r = await admin_client.post(f"/api/v1/course/{cid}/chapters", json={
            "title": "第一章", "content": "内容"
        })
        assert ch_r.status_code == 200
        # 获取章节
        chs_r = await admin_client.get(f"/api/v1/course/{cid}/chapters")
        assert chs_r.status_code == 200
        # 删除
        del_r = await admin_client.delete(f"/api/v1/course/{cid}")
        assert del_r.status_code == 200

    async def test_learning_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/course/learning/stats")
        assert resp.status_code == 200


class TestCourseManifest:
    def test_manifest(self):
        from modules.course.course_manifest import manifest
        assert manifest.id == "course"
        assert manifest.enabled is True
