"""
考试模块数据模型
定义数据库表结构
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship

from core.database import Base
from utils.timezone import get_beijing_time


class ExamQuestionBank(Base):
    """
    题库分类表
    用于管理题目分类
    """
    __tablename__ = "exam_question_banks"
    __table_args__ = {'extend_existing': True, 'comment': '题库分类表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="创建者ID")
    
    name = Column(String(100), nullable=False, comment="题库名称")
    description = Column(Text, nullable=True, comment="题库描述")
    parent_id = Column(Integer, nullable=True, comment="父分类ID")
    
    # 统计字段
    question_count = Column(Integer, default=0, comment="题目数量")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联题目
    questions = relationship("ExamQuestion", back_populates="bank", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ExamQuestionBank(id={self.id}, name={self.name})>"


class ExamQuestion(Base):
    """
    题目表
    存储所有考试题目
    """
    __tablename__ = "exam_questions"
    __table_args__ = {'extend_existing': True, 'comment': '考试题目表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="创建者ID")
    bank_id = Column(Integer, ForeignKey("exam_question_banks.id", ondelete="SET NULL"), nullable=True, index=True, comment="所属题库ID")
    
    # 题目类型：single(单选), multiple(多选), judge(判断), fill(填空), essay(问答)
    question_type = Column(String(20), nullable=False, default="single", comment="题目类型")
    
    # 题目内容
    title = Column(Text, nullable=False, comment="题干")
    options = Column(JSON, nullable=True, comment="选项列表(JSON)")  # [{"key": "A", "value": "选项内容"}, ...]
    answer = Column(Text, nullable=False, comment="正确答案")  # 单选:A, 多选:A,B,C, 判断:true/false, 填空/问答:答案文本
    analysis = Column(Text, nullable=True, comment="答案解析")
    
    # 分值与难度
    score = Column(Float, default=1.0, comment="分值")
    difficulty = Column(Integer, default=1, comment="难度等级(1-5)")
    
    # 标签
    tags = Column(String(500), nullable=True, comment="标签(逗号分隔)")
    
    # 状态
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    bank = relationship("ExamQuestionBank", back_populates="questions")
    
    def __repr__(self):
        return f"<ExamQuestion(id={self.id}, type={self.question_type})>"


class ExamPaper(Base):
    """
    试卷表
    存储试卷配置
    """
    __tablename__ = "exam_papers"
    __table_args__ = {'extend_existing': True, 'comment': '试卷表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="创建者ID")
    
    # 试卷基本信息
    title = Column(String(200), nullable=False, comment="试卷标题")
    description = Column(Text, nullable=True, comment="试卷描述")
    
    # 考试配置
    total_score = Column(Float, default=100.0, comment="总分")
    pass_score = Column(Float, default=60.0, comment="及格分数")
    duration = Column(Integer, default=60, comment="考试时长(分钟)")
    
    # 试卷设置
    shuffle_questions = Column(Boolean, default=False, comment="题目乱序")
    shuffle_options = Column(Boolean, default=False, comment="选项乱序")
    show_answer = Column(Boolean, default=True, comment="交卷后显示答案")
    allow_review = Column(Boolean, default=True, comment="允许查看解析")
    
    # 考试时间
    start_time = Column(DateTime, nullable=True, comment="考试开始时间")
    end_time = Column(DateTime, nullable=True, comment="考试结束时间")
    
    # 状态：draft(草稿), published(已发布), closed(已关闭)
    status = Column(String(20), default="draft", comment="试卷状态")
    
    # 统计
    question_count = Column(Integer, default=0, comment="题目数量")
    take_count = Column(Integer, default=0, comment="参考人数")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    paper_questions = relationship("ExamPaperQuestion", back_populates="paper", cascade="all, delete-orphan")
    records = relationship("ExamRecord", back_populates="paper", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ExamPaper(id={self.id}, title={self.title})>"


class ExamPaperQuestion(Base):
    """
    试卷题目关联表
    存储试卷包含的题目
    """
    __tablename__ = "exam_paper_questions"
    __table_args__ = {'extend_existing': True, 'comment': '试卷题目表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    paper_id = Column(Integer, ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False, index=True, comment="试卷ID")
    question_id = Column(Integer, ForeignKey("exam_questions.id", ondelete="CASCADE"), nullable=False, index=True, comment="题目ID")
    
    # 排序和分值
    sort_order = Column(Integer, default=0, comment="排序序号")
    score = Column(Float, nullable=True, comment="本题分值(可覆盖题目默认分值)")
    
    # 关联
    paper = relationship("ExamPaper", back_populates="paper_questions")
    question = relationship("ExamQuestion")
    
    def __repr__(self):
        return f"<ExamPaperQuestion(paper_id={self.paper_id}, question_id={self.question_id})>"


class ExamRecord(Base):
    """
    考试记录表
    存储学生考试记录
    """
    __tablename__ = "exam_records"
    __table_args__ = {'extend_existing': True, 'comment': '考试记录表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="考生ID")
    paper_id = Column(Integer, ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False, index=True, comment="试卷ID")
    
    # 考试状态：pending(未开始), in_progress(进行中), submitted(已提交), graded(已阅卷)
    status = Column(String(20), default="pending", comment="考试状态")
    
    # 成绩
    score = Column(Float, nullable=True, comment="得分")
    total_score = Column(Float, nullable=True, comment="总分")
    is_passed = Column(Boolean, nullable=True, comment="是否及格")
    
    # 答题统计
    correct_count = Column(Integer, default=0, comment="正确数量")
    wrong_count = Column(Integer, default=0, comment="错误数量")
    unanswered_count = Column(Integer, default=0, comment="未答数量")
    
    # 时间记录
    start_time = Column(DateTime, nullable=True, comment="开始时间")
    submit_time = Column(DateTime, nullable=True, comment="提交时间")
    used_seconds = Column(Integer, nullable=True, comment="用时(秒)")
    
    # 阅卷信息
    grader_id = Column(Integer, nullable=True, comment="阅卷人ID")
    graded_at = Column(DateTime, nullable=True, comment="阅卷时间")
    review_comment = Column(Text, nullable=True, comment="阅卷评语")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    paper = relationship("ExamPaper", back_populates="records")
    answers = relationship("ExamAnswer", back_populates="record", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ExamRecord(id={self.id}, user_id={self.user_id}, paper_id={self.paper_id})>"


class ExamAnswer(Base):
    """
    答题详情表
    存储每道题的答题情况
    """
    __tablename__ = "exam_answers"
    __table_args__ = {'extend_existing': True, 'comment': '答题记录表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    record_id = Column(Integer, ForeignKey("exam_records.id", ondelete="CASCADE"), nullable=False, index=True, comment="考试记录ID")
    question_id = Column(Integer, nullable=False, index=True, comment="题目ID")
    
    # 答题内容
    user_answer = Column(Text, nullable=True, comment="用户答案")
    correct_answer = Column(Text, nullable=True, comment="正确答案")
    
    # 评分
    is_correct = Column(Boolean, nullable=True, comment="是否正确")
    score = Column(Float, default=0.0, comment="得分")
    max_score = Column(Float, nullable=True, comment="满分")
    
    # 阅卷评语(主观题)
    comment = Column(Text, nullable=True, comment="评语")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    record = relationship("ExamRecord", back_populates="answers")
    
    def __repr__(self):
        return f"<ExamAnswer(record_id={self.record_id}, question_id={self.question_id})>"


class ExamWrongQuestion(Base):
    """
    错题本表
    记录用户的错题以供复习
    """
    __tablename__ = "exam_wrong_questions"
    __table_args__ = {'extend_existing': True, 'comment': '错题本表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="用户ID")
    question_id = Column(Integer, ForeignKey("exam_questions.id", ondelete="CASCADE"), nullable=False, index=True, comment="题目ID")
    paper_id = Column(Integer, nullable=True, comment="来源试卷ID")
    
    # 错误详情
    user_answer = Column(Text, nullable=True, comment="用户的错误答案")
    correct_answer = Column(Text, nullable=True, comment="正确答案")
    
    # 统计
    wrong_count = Column(Integer, default=1, comment="错误次数")
    
    # 时间戳
    first_wrong_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="首次错误时间")
    last_wrong_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="最近错误时间")
    
    # 关联
    question = relationship("ExamQuestion")
    
    def __repr__(self):
        return f"<ExamWrongQuestion(user_id={self.user_id}, question_id={self.question_id})>"


class ExamCheatLog(Base):
    """
    作弊日志表
    记录考试中的异常行为
    """
    __tablename__ = "exam_cheat_logs"
    __table_args__ = {'extend_existing': True, 'comment': '作弊日志表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    record_id = Column(Integer, ForeignKey("exam_records.id", ondelete="CASCADE"), nullable=False, index=True, comment="考试记录ID")
    user_id = Column(Integer, nullable=False, index=True, comment="用户ID")
    
    # 行为详情
    action = Column(String(100), nullable=False, comment="行为类型")
    count = Column(Integer, default=1, comment="累计次数")
    
    # 时间
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="记录时间")
    
    # 关联
    record = relationship("ExamRecord")
    
    def __repr__(self):
        return f"<ExamCheatLog(record_id={self.record_id}, action={self.action})>"
