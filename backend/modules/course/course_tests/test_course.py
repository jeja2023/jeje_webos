
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from modules.course.course_services import CourseService, ChapterService, EnrollmentService
from modules.course.course_schemas import CourseCreate, CourseUpdate, ChapterCreate, ProgressUpdate
from modules.course.course_models import Course

# Mock user ID
USER_ID = 1

class TestCourseModule:
    """Course模块测试"""
    
    @pytest.mark.asyncio
    async def test_course_flow(self, db: AsyncSession):
        """测试课程完整流程：创建->章节->发布->查询->删除"""
        
        # 1. Create Course
        course_data = CourseCreate(
            title="Python Mastery",
            description="Learn Python from scratch",
            difficulty="beginner",
            duration_hours=10
        )
        course = await CourseService.create_course(db, USER_ID, course_data)
        assert course.id is not None
        assert course.title == "Python Mastery"
        
        # 2. Add Chapters
        chap1_data = ChapterCreate(title="Intro", sort_order=1, duration_minutes=60)
        chap2_data = ChapterCreate(title="Advanced", sort_order=2, duration_minutes=120)
        
        chap1 = await ChapterService.create_chapter(db, course.id, chap1_data)
        chap2 = await ChapterService.create_chapter(db, course.id, chap2_data)
        
        assert chap1.id is not None
        assert chap2.id is not None
        
        # 3. Publish and List
        await CourseService.update_course(db, course.id, CourseUpdate(is_published=True))
        
        courses, total = await CourseService.get_course_list(db, only_published=True, keyword="Python")
        assert total >= 1
        assert courses[0].title == "Python Mastery"
        
        # 4. Get Detail with Chapters
        detail = await CourseService.get_course_detail(db, course.id)
        assert detail["chapter_count"] == 2
        assert len(detail["chapters"]) == 2
        
        # 5. Delete (Clean up)
        success = await CourseService.delete_course(db, course.id)
        assert success is True
        
        # Verify Delete
        fetched = await CourseService.get_course_by_id(db, course.id)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_learning_progress(self, db: AsyncSession):
        """测试学习进度追踪"""
        # Setup Course and Chapters
        course = await CourseService.create_course(
            db, USER_ID, CourseCreate(title="Progress Test", difficulty="easy")
        )
        chap1 = await ChapterService.create_chapter(
            db, course.id, ChapterCreate(title="C1", sort_order=1)
        )
        chap2 = await ChapterService.create_chapter(
            db, course.id, ChapterCreate(title="C2", sort_order=2)
        )
        
        # 1. Enroll
        enrollment = await EnrollmentService.enroll_course(db, USER_ID, course.id)
        assert enrollment.progress == 0
        
        # 2. Complete Chapter 1
        # Mock watching 50% of chapter 1, then completing it
        prog_update = ProgressUpdate(
            chapter_id=chap1.id,
            is_completed=True,
            progress_seconds=100
        )
        await EnrollmentService.update_chapter_progress(db, USER_ID, prog_update)
        
        # Verify Course Progress (1 of 2 chapters done => 50%)
        # Refresh enrollment explicitly
        enrollment = await EnrollmentService.get_enrollment(db, USER_ID, course.id)
        assert enrollment.progress == 50.0
        assert enrollment.last_chapter_id == chap1.id
        
        # 3. Complete Chapter 2
        prog_update2 = ProgressUpdate(
            chapter_id=chap2.id,
            is_completed=True,
            progress_seconds=200
        )
        await EnrollmentService.update_chapter_progress(db, USER_ID, prog_update2)
        
        # Verify Completion
        enrollment = await EnrollmentService.get_enrollment(db, USER_ID, course.id)
        assert enrollment.progress == 100.0
        assert enrollment.completed_at is not None
        
        # 4. Learning Stats
        stats = await EnrollmentService.get_learning_stats(db, USER_ID)
        assert stats["completed_count"] >= 1
        assert stats["enrolled_count"] >= 1
        
        # Clean up
        await CourseService.delete_course(db, course.id)

