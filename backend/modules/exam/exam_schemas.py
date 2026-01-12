"""
考试模块数据验证
定义请求/响应的数据结构
"""

from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, Field


# ==================== 题库模型 ====================

class QuestionBankBase(BaseModel):
    """题库基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="题库名称")
    description: Optional[str] = Field(None, description="题库描述")
    parent_id: Optional[int] = Field(None, description="父分类ID")


class QuestionBankCreate(QuestionBankBase):
    """创建题库"""
    pass


class QuestionBankUpdate(BaseModel):
    """更新题库"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    parent_id: Optional[int] = None


class QuestionBankResponse(QuestionBankBase):
    """题库响应"""
    id: int
    user_id: int
    question_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 题目模型 ====================

class QuestionOption(BaseModel):
    """选项模型"""
    key: str = Field(..., description="选项标识(A/B/C/D)")
    value: str = Field(..., description="选项内容")


class QuestionBase(BaseModel):
    """题目基础模型"""
    question_type: str = Field("single", description="题目类型")
    title: str = Field(..., min_length=1, description="题干")
    options: Optional[List[QuestionOption]] = Field(None, description="选项列表")
    answer: str = Field(..., description="正确答案")
    analysis: Optional[str] = Field(None, description="答案解析")
    score: float = Field(1.0, ge=0, description="分值")
    difficulty: int = Field(1, ge=1, le=5, description="难度等级")
    tags: Optional[str] = Field(None, description="标签")
    bank_id: Optional[int] = Field(None, description="题库ID")


class QuestionCreate(QuestionBase):
    """创建题目"""
    pass


class QuestionUpdate(BaseModel):
    """更新题目"""
    question_type: Optional[str] = None
    title: Optional[str] = None
    options: Optional[List[QuestionOption]] = None
    answer: Optional[str] = None
    analysis: Optional[str] = None
    score: Optional[float] = None
    difficulty: Optional[int] = None
    tags: Optional[str] = None
    bank_id: Optional[int] = None
    is_active: Optional[bool] = None


class QuestionResponse(BaseModel):
    """题目响应"""
    id: int
    user_id: int
    bank_id: Optional[int] = None
    question_type: str
    title: str
    options: Optional[List[dict]] = None
    answer: str
    analysis: Optional[str] = None
    score: float
    difficulty: int
    tags: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class QuestionListResponse(BaseModel):
    """题目列表响应"""
    items: List[QuestionResponse]
    total: int
    page: int
    page_size: int


# ==================== 试卷模型 ====================

class PaperBase(BaseModel):
    """试卷基础模型"""
    title: str = Field(..., min_length=1, max_length=200, description="试卷标题")
    description: Optional[str] = Field(None, description="试卷描述")
    total_score: float = Field(100.0, ge=0, description="总分")
    pass_score: float = Field(60.0, ge=0, description="及格分")
    duration: int = Field(60, ge=1, description="考试时长(分钟)")
    shuffle_questions: bool = Field(False, description="题目乱序")
    shuffle_options: bool = Field(False, description="选项乱序")
    show_answer: bool = Field(True, description="显示答案")
    allow_review: bool = Field(True, description="允许查看解析")


class PaperCreate(PaperBase):
    """创建试卷"""
    question_ids: Optional[List[int]] = Field(None, description="题目ID列表")
    start_time: Optional[datetime] = Field(None, description="开始时间")
    end_time: Optional[datetime] = Field(None, description="结束时间")


class PaperUpdate(BaseModel):
    """更新试卷"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    total_score: Optional[float] = None
    pass_score: Optional[float] = None
    duration: Optional[int] = None
    shuffle_questions: Optional[bool] = None
    shuffle_options: Optional[bool] = None
    show_answer: Optional[bool] = None
    allow_review: Optional[bool] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None


class PaperQuestionAdd(BaseModel):
    """添加试卷题目"""
    question_ids: List[int] = Field(..., description="题目ID列表")


class PaperQuestionOrder(BaseModel):
    """调整题目顺序"""
    question_id: int
    sort_order: int


class PaperResponse(PaperBase):
    """试卷响应"""
    id: int
    user_id: int
    status: str
    question_count: int
    take_count: int
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PaperDetailResponse(PaperResponse):
    """试卷详情（含题目）"""
    questions: List[QuestionResponse] = []


class PaperListResponse(BaseModel):
    """试卷列表响应"""
    items: List[PaperResponse]
    total: int
    page: int
    page_size: int


# ==================== 考试记录模型 ====================

class ExamStart(BaseModel):
    """开始考试"""
    paper_id: int = Field(..., description="试卷ID")


class ExamSubmitAnswer(BaseModel):
    """提交单题答案"""
    question_id: int = Field(..., description="题目ID")
    answer: str = Field(..., description="答案")


class ExamSubmit(BaseModel):
    """提交试卷"""
    answers: List[ExamSubmitAnswer] = Field(..., description="答案列表")


class AnswerResponse(BaseModel):
    """答题响应"""
    question_id: int
    user_answer: Optional[str] = None
    correct_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    score: float = 0
    max_score: Optional[float] = None
    comment: Optional[str] = None


class RecordResponse(BaseModel):
    """考试记录响应"""
    id: int
    user_id: int
    paper_id: int
    paper_title: Optional[str] = None
    status: str
    score: Optional[float] = None
    total_score: Optional[float] = None
    is_passed: Optional[bool] = None
    correct_count: int = 0
    wrong_count: int = 0
    unanswered_count: int = 0
    start_time: Optional[datetime] = None
    submit_time: Optional[datetime] = None
    used_seconds: Optional[int] = None
    grader_id: Optional[int] = None
    graded_at: Optional[datetime] = None
    review_comment: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class RecordDetailResponse(RecordResponse):
    """考试记录详情（含答题）"""
    answers: List[AnswerResponse] = []


class RecordListResponse(BaseModel):
    """记录列表响应"""
    items: List[RecordResponse]
    total: int
    page: int
    page_size: int


# ==================== 阅卷模型 ====================

class GradeAnswer(BaseModel):
    """评分单题"""
    question_id: int = Field(..., description="题目ID")
    score: float = Field(..., ge=0, description="得分")
    comment: Optional[str] = Field(None, description="评语")


class GradeSubmit(BaseModel):
    """提交阅卷"""
    grades: List[GradeAnswer] = Field(..., description="评分列表")
    review_comment: Optional[str] = Field(None, description="总评")


# ==================== 考试进行中模型 ====================

class ExamQuestionView(BaseModel):
    """考试中题目视图（不含答案）"""
    id: int
    question_type: str
    title: str
    options: Optional[List[dict]] = None
    score: float
    sort_order: int


class ExamPaperView(BaseModel):
    """考试中试卷视图"""
    paper_id: int
    record_id: int
    title: str
    total_score: float
    duration: int
    remaining_seconds: int
    questions: List[ExamQuestionView]
    saved_answers: dict = {}  # {question_id: answer}


# ==================== 智能组卷模型 ====================

class SmartPaperRule(BaseModel):
    """智能组卷规则"""
    question_type: str = Field(..., description="题目类型")
    count: int = Field(..., ge=1, description="题目数量")
    score_per_question: float = Field(1.0, ge=0, description="每题分值")
    difficulty_range: Optional[List[int]] = Field(None, description="难度范围[min, max]")
    bank_ids: Optional[List[int]] = Field(None, description="指定题库ID列表")


class SmartPaperCreate(BaseModel):
    """智能组卷请求"""
    title: str = Field(..., min_length=1, max_length=200, description="试卷标题")
    description: Optional[str] = Field(None, description="试卷描述")
    duration: int = Field(60, ge=1, description="考试时长(分钟)")
    pass_score: float = Field(60.0, ge=0, description="及格分")
    shuffle_questions: bool = Field(True, description="题目乱序")
    shuffle_options: bool = Field(False, description="选项乱序")
    rules: List[SmartPaperRule] = Field(..., description="组卷规则列表")


# ==================== 错题本模型 ====================

class WrongQuestionResponse(BaseModel):
    """错题响应"""
    id: int
    question_id: int
    question_type: str
    title: str
    options: Optional[List[dict]] = None
    correct_answer: str
    user_answer: str
    analysis: Optional[str] = None
    paper_title: Optional[str] = None
    wrong_count: int = 1
    last_wrong_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class WrongQuestionListResponse(BaseModel):
    """错题列表响应"""
    items: List[WrongQuestionResponse]
    total: int
    page: int
    page_size: int


# ==================== 成绩排名模型 ====================

class RankingItem(BaseModel):
    """排名项"""
    rank: int
    user_id: int
    username: Optional[str] = None
    score: float
    used_seconds: Optional[int] = None
    submit_time: Optional[datetime] = None


class PaperRankingResponse(BaseModel):
    """试卷排名响应"""
    paper_id: int
    paper_title: str
    total_score: float
    pass_score: float
    take_count: int
    pass_count: int
    pass_rate: float
    avg_score: float
    rankings: List[RankingItem]


# ==================== 题目批量导入模型 ====================

class QuestionImportItem(BaseModel):
    """导入题目项"""
    question_type: str = Field("single", description="题目类型")
    title: str = Field(..., description="题干")
    option_a: Optional[str] = Field(None, description="选项A")
    option_b: Optional[str] = Field(None, description="选项B")
    option_c: Optional[str] = Field(None, description="选项C")
    option_d: Optional[str] = Field(None, description="选项D")
    option_e: Optional[str] = Field(None, description="选项E")
    option_f: Optional[str] = Field(None, description="选项F")
    answer: str = Field(..., description="正确答案")
    analysis: Optional[str] = Field(None, description="解析")
    score: float = Field(1.0, description="分值")
    difficulty: int = Field(1, ge=1, le=5, description="难度")


class QuestionImportRequest(BaseModel):
    """批量导入请求"""
    bank_id: Optional[int] = Field(None, description="目标题库ID")
    questions: List[QuestionImportItem] = Field(..., description="题目列表")


# ==================== 作弊日志 ====================

class CheatLogCreate(BaseModel):
    """作弊日志请求"""
    record_id: int = Field(..., description="考试记录ID")
    action: str = Field(..., max_length=100, description="行为类型")
    count: int = Field(1, ge=1, description="累计次数")
    timestamp: Optional[str] = Field(None, description="客户端时间戳")
