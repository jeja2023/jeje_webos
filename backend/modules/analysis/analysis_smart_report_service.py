"""
智能报告服务 (Markdown + WeasyPrint 版)

使用 Toast UI Editor (Markdown) 作为前端编辑器
使用 Markdown 库进行后端解析
使用 WeasyPrint 生成高清 PDF
支持数据保存以便后续知识库管理
"""

from typing import List, Optional, Dict, Any
import os
import json
import uuid
import re
from pathlib import Path
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

import markdown
from pygments.formatters import HtmlFormatter

from core.config import get_settings
from utils.storage import get_storage_manager
from .analysis_models import AnalysisSmartReport, AnalysisSmartReportRecord

settings = get_settings()

# 获取存储管理器
storage_manager = get_storage_manager()
# 基础模块目录（不含用户ID，用于确保目录存在）
REPORT_DIR = storage_manager.get_module_dir("report")
TEMP_DIR = storage_manager.get_module_dir("report", "temp")
ARCHIVE_DIR = storage_manager.get_module_dir("report", "archive")


class SmartReportService:
    """智能报告服务类"""
    
    @staticmethod
    def _ensure_dirs():
        """确保存储目录存在"""
        for d in [REPORT_DIR, TEMP_DIR, ARCHIVE_DIR]:
            os.makedirs(d, exist_ok=True)
    
    # ==================== 模板管理 ====================
    
    @staticmethod
    async def get_reports(db: AsyncSession) -> List[AnalysisSmartReport]:
        """获取所有报告模板"""
        res = await db.execute(select(AnalysisSmartReport).order_by(AnalysisSmartReport.created_at.desc()))
        return res.scalars().all()
    
    @staticmethod
    async def get_report(db: AsyncSession, report_id: int) -> Optional[AnalysisSmartReport]:
        """获取单个报告模板"""
        res = await db.execute(select(AnalysisSmartReport).where(AnalysisSmartReport.id == report_id))
        return res.scalar_one_or_none()
    
    @staticmethod
    async def create_report(db: AsyncSession, name: str) -> AnalysisSmartReport:
        """创建新报告模板"""
        SmartReportService._ensure_dirs()
        report = AnalysisSmartReport(
            name=name,
            template_vars=[],
            content_md="# " + name + "\n\n请在此开始编写报告模板..."
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return report
    
    @staticmethod
    async def update_template_content(
        db: AsyncSession, 
        report_id: int, 
        content_md: str, 
        content_html: Optional[str] = None,
        template_vars: List[str] = [],
        dataset_id: Optional[int] = None,
        data_row: Optional[str] = None
    ) -> AnalysisSmartReport:
        """更新报告模板内容"""
        report = await SmartReportService.get_report(db, report_id)
        if not report:
            raise Exception("报告模板不存在")
        
        report.content_md = content_md
        if content_html:
            report.content_html = content_html
        report.template_vars = template_vars
        report.dataset_id = dataset_id
        report.data_row = data_row
        report.updated_at = datetime.now()
        
        await db.commit()
        await db.refresh(report)
        return report
    
    @staticmethod
    async def update_report(db: AsyncSession, report_id: int, name: str) -> AnalysisSmartReport:
        """更新报告基本信息（重命名）"""
        report = await SmartReportService.get_report(db, report_id)
        if not report:
            raise Exception("报告模板不存在")
        
        report.name = name
        report.updated_at = datetime.now()
        await db.commit()
        await db.refresh(report)
        return report
    
    @staticmethod
    async def delete_report(db: AsyncSession, report_id: int):
        """删除报告模板及其关联记录和文件（包括整个报告目录）"""
        import logging
        import shutil
        import glob
        logger = logging.getLogger(__name__)
        
        # 先获取所有关联记录并删除其文件
        res = await db.execute(
            select(AnalysisSmartReportRecord).where(AnalysisSmartReportRecord.report_id == report_id)
        )
        records = res.scalars().all()
        
        for record in records:
            # 删除 PDF 文件及相关文件
            if record.pdf_file_path:
                for storage_dir in [TEMP_DIR, ARCHIVE_DIR]:
                    file_path = os.path.join(str(storage_dir), record.pdf_file_path)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            logger.info(f"已删除 PDF 文件: {file_path}")
                            
                            # 同时删除相关的调试文件和图片目录
                            file_dir = os.path.dirname(file_path)
                            file_base = os.path.basename(file_path).replace('.pdf', '')
                            
                            # 删除 debug.html 文件
                            debug_file = os.path.join(file_dir, f"{file_base}_debug.html")
                            if os.path.exists(debug_file):
                                os.remove(debug_file)
                            
                            # 删除 images 目录
                            images_dir = os.path.join(file_dir, f"images_{file_base}")
                            if os.path.exists(images_dir):
                                shutil.rmtree(images_dir)
                                
                        except Exception as e:
                            logger.warning(f"删除 PDF 文件失败: {file_path}, 错误: {e}")
            
            # 删除 DOCX 文件
            if record.docx_file_path:
                for storage_dir in [TEMP_DIR, ARCHIVE_DIR]:
                    file_path = os.path.join(str(storage_dir), record.docx_file_path)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            logger.info(f"已删除 DOCX 文件: {file_path}")
                        except Exception as e:
                            logger.warning(f"删除 DOCX 文件失败: {file_path}, 错误: {e}")
        
        # 删除所有用户目录下的该报告目录
        for storage_dir in [TEMP_DIR, ARCHIVE_DIR]:
            # 查找所有 user_*/report_{id} 目录
            pattern = os.path.join(str(storage_dir), f"user_*/report_{report_id}")
            for report_dir in glob.glob(pattern):
                if os.path.exists(report_dir):
                    try:
                        shutil.rmtree(report_dir)
                        logger.info(f"已删除报告目录: {report_dir}")
                    except Exception as e:
                        logger.warning(f"删除报告目录失败: {report_dir}, 错误: {e}")
        
        # 删除数据库中的关联记录
        await db.execute(delete(AnalysisSmartReportRecord).where(AnalysisSmartReportRecord.report_id == report_id))
        
        # 删除报告模板
        report = await SmartReportService.get_report(db, report_id)
        if report:
            await db.delete(report)
            await db.commit()

    # ==================== 报告生成 ====================
    
    @staticmethod
    def _md_to_html(md_content: str, use_simple_css: bool = False, temp_dir: str = None, db: AsyncSession = None) -> str:
        """
        将 Markdown 转换为 HTML，并应用样式
        
        Args:
            md_content: Markdown 内容
            use_simple_css: 如果为 True，使用简化版 CSS（兼容 xhtml2pdf，不支持 @page、counter 等）
            temp_dir: 临时目录路径，用于保存 base64 图片转换后的文件
            db: 数据库会话，用于查询图表数据（处理图表占位符）
        """
        import base64
        
        # 处理图表占位符：将 chart:chartId 替换为实际的图表图片
        # 格式：![图表名称](chart:chartId)
        # 注意：前端在发送 content_md 时已经将图表占位符替换为 base64 图片
        # 这里保留此逻辑是为了处理可能遗留的占位符（向后兼容）
        if db:
            chart_placeholder_pattern = r'!\[([^\]]*)\]\(chart:(\d+)\)'
            chart_matches = list(re.finditer(chart_placeholder_pattern, md_content))
            
            if chart_matches:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"检测到 {len(chart_matches)} 个未处理的图表占位符，这些占位符应该在前端已转换为 base64 图片")
                
                # 如果发现有图表占位符，记录警告但继续处理
                # 实际图表渲染由前端完成，后端只负责将已处理的 Markdown 转换为 PDF
                for match in chart_matches:
                    chart_id = int(match.group(2))
                    chart_name = match.group(1) or '图表'
                    logger.debug(f"发现图表占位符: {chart_name} (ID: {chart_id})")
        
        # 处理 base64 图片：将 data URI 转换为临时文件
        # 这样可以避免 WeasyPrint/xhtml2pdf 处理超长 base64 字符串时的问题
        if temp_dir:
            os.makedirs(temp_dir, exist_ok=True)
            
            # 匹配 Markdown 图片语法中的 data URI: ![alt](data:image/...;base64,...)
            def replace_base64_image(match):
                alt_text = match.group(1) or ''
                data_uri = match.group(2)
                
                # 解析 data URI
                if data_uri.startswith('data:image/'):
                    # 提取 MIME 类型和 base64 数据
                    header, encoded = data_uri.split(',', 1)
                    mime_type = header.split(';')[0].split(':')[1]  # image/png
                    ext = mime_type.split('/')[1]  # png
                    
                    try:
                        # 解码 base64
                        image_data = base64.b64decode(encoded)
                        
                        # 生成临时文件名
                        temp_filename = f"img_{uuid.uuid4().hex[:8]}.{ext}"
                        temp_path = os.path.join(temp_dir, temp_filename)
                        
                        # 保存为临时文件
                        with open(temp_path, 'wb') as f:
                            f.write(image_data)
                        
                        # 返回相对路径（相对于 temp_dir）
                        return f'![{alt_text}]({temp_filename})'
                    except Exception as e:
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f"处理 base64 图片失败: {e}")
                        # 如果处理失败，返回原始内容
                        return match.group(0)
                
                return match.group(0)
            
            # 替换所有 base64 图片
            # 注意：需要匹配可能跨行的 base64 数据（使用 re.DOTALL）
            pattern = r'!\[([^\]]*)\]\((data:image/[^)]+)\)'
            original_md = md_content
            md_content = re.sub(pattern, replace_base64_image, md_content, flags=re.DOTALL)
            
            # 调试：记录转换的图片数量
            import logging
            logger = logging.getLogger(__name__)
            base64_count = len(re.findall(pattern, original_md, flags=re.DOTALL))
            if base64_count > 0:
                logger.info(f"检测到 {base64_count} 个 base64 图片，已转换为临时文件")
        
        # 使用扩展：表格、分级标题、代码高亮等
        extensions = [
            'toc',
            'tables',
            'fenced_code',
            'codehilite',
            'nl2br',
            'attr_list'
        ]
        
        html_body = markdown.markdown(md_content, extensions=extensions)
        
        if use_simple_css:
            # xhtml2pdf 兼容的简化 CSS（不支持 @page、counter、box-shadow 等）
            css_style = """
        body {
            font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #333;
            margin: 2.5cm;
            padding: 0;
        }
        h1 { font-size: 24pt; text-align: center; margin-bottom: 30pt; color: #000; }
        h2 { font-size: 18pt; border-bottom: 1px solid #eee; padding-bottom: 5pt; margin-top: 20pt; color: #2c3e50; }
        h3 { font-size: 14pt; margin-top: 15pt; color: #34495e; }
        p { margin: 10pt 0; text-indent: 0; }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 15pt 0; 
            font-size: 10pt;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 8pt; 
            text-align: left; 
        }
        th { background-color: #f8f9fa; font-weight: bold; }
        img { 
            max-width: 100%; 
            height: auto; 
            display: block; 
            margin: 15pt auto; 
        }
        code {
            font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
        }
        pre {
            background-color: #f5f5f5;
            padding: 10pt;
            overflow-x: auto;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .report-header { border-bottom: 2pt solid #2c3e50; padding-bottom: 10pt; margin-bottom: 20pt; }
        .report-footer { margin-top: 50pt; text-align: right; font-size: 10pt; color: #7f8c8d; }
"""
        else:
            # WeasyPrint 支持的高级 CSS（支持 @page、counter 等）
            css_style = """
        @page {
            size: A4;
            margin: 2.5cm 2.5cm;
            @bottom-right {
                content: "第 " counter(page) " 页";
                font-family: "Microsoft YaHei", sans-serif;
                font-size: 10pt;
            }
        }
        body {
            font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
        }
        h1 { font-size: 24pt; text-align: center; margin-bottom: 30pt; color: #000; }
        h2 { font-size: 18pt; border-bottom: 1px solid #eee; padding-bottom: 5pt; margin-top: 20pt; color: #2c3e50; }
        h3 { font-size: 14pt; margin-top: 15pt; color: #34495e; }
        p { margin: 10pt 0; text-indent: 0; }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 15pt 0; 
            font-size: 10pt;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 8pt; 
            text-align: left; 
        }
        th { background-color: #f8f9fa; font-weight: bold; }
        img { 
            max-width: 100%; 
            height: auto; 
            display: block; 
            margin: 15pt auto; 
        }
        code {
            font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3pt;
        }
        pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5pt;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .report-header { border-bottom: 2pt solid #2c3e50; padding-bottom: 10pt; margin-bottom: 20pt; }
        .report-footer { margin-top: 50pt; text-align: right; font-size: 10pt; color: #7f8c8d; }
"""
        
        # 构建完整的 HTML 文档
        full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>{css_style}
    </style>
</head>
<body>
    <div class="report-content">
        {html_body}
    </div>
</body>
</html>"""
        return full_html

    @staticmethod
    def _clean_base64_images(content: str) -> str:
        """清理 base64 图片数据，只保留图片描述（用于存储到数据库）"""
        import re
        if not content:
            return content
        
        # 替换 base64 图片为占位符描述
        # 格式: ![alt](data:image/xxx;base64,...)
        pattern = r'!\[([^\]]*)\]\(data:image/[^;]+;base64,[^)]+\)'
        result = re.sub(pattern, r'[图片: \1]', content)
        return result
    
    @staticmethod
    def _fill_variables(content: str, data_context: Dict[str, Any]) -> str:
        """填充变量到内容中"""
        if not content:
            return content
        
        result = content
        for var_name, var_value in data_context.items():
            placeholder = '{{' + var_name + '}}'
            # 处理特殊值，如 None
            val_str = str(var_value) if var_value is not None else ""
            result = result.replace(placeholder, val_str)
        
        return result

    @staticmethod
    async def generate_report(
        db: AsyncSession,
        report_id: int,
        data_context: Dict[str, Any],
        save_record: bool = False,
        record_name: str = None,
        content_md: Optional[str] = None,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        生成报告
        
        Args:
            db: 数据库会话
            report_id: 报告模板 ID
            data_context: 数据上下文（用于变量替换）
            save_record: 是否保存为记录
            record_name: 记录名称
            content_md: 可选的处理后的 Markdown 内容（如果提供，则使用此内容而不是模板内容）
            user_id: 用户ID（用于文件目录隔离）
        """
        SmartReportService._ensure_dirs()
        
        report = await SmartReportService.get_report(db, report_id)
        if not report:
            raise Exception("报告模板不存在")
        
        # 如果提供了处理后的内容，直接使用；否则使用模板内容
        base_md = content_md if content_md else (report.content_md or "")
        if not base_md:
            raise Exception("报告模板内容为空")
            
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        file_base = f"report_{timestamp}_{uuid.uuid4().hex[:6]}"
        
        # 使用存储管理器获取用户隔离的目录
        # 目录结构: modules/report/temp/user_{id}/report_{id}/
        effective_user_id = user_id if user_id else 0
        user_dir_name = f"user_{effective_user_id}"
        
        # 获取用户级别的模块目录
        temp_user_dir = storage_manager.get_module_dir("report", "temp", effective_user_id)
        archive_user_dir = storage_manager.get_module_dir("report", "archive", effective_user_id)
        
        # 在用户目录下创建报告子目录
        temp_report_dir = os.path.join(str(temp_user_dir), f"report_{report_id}")
        archive_report_dir = os.path.join(str(archive_user_dir), f"report_{report_id}")
        os.makedirs(temp_report_dir, exist_ok=True)
        os.makedirs(archive_report_dir, exist_ok=True)
        
        # 1. 变量替换（如果内容中还有未替换的变量）
        filled_md = SmartReportService._fill_variables(base_md, data_context)
        
        # 2. 生成 PDF (优先使用 WeasyPrint，失败时回退到 xhtml2pdf)
        pdf_filename = f"{file_base}.pdf"
        # 存储相对路径（包含用户ID和报告ID子目录）
        pdf_relative_path = f"{user_dir_name}/report_{report_id}/{pdf_filename}"
        pdf_path = os.path.join(temp_report_dir, pdf_filename)
        pdf_success = False
        
        # 创建临时目录用于存储转换后的图片
        images_temp_dir = os.path.join(temp_report_dir, f"images_{file_base}")
        os.makedirs(images_temp_dir, exist_ok=True)
        
        # 方法1: 尝试使用 WeasyPrint (高质量，但需要 GTK+ 库)
        try:
            from weasyprint import HTML
            import logging
            logger = logging.getLogger(__name__)
            
            # 使用完整版 HTML（支持高级 CSS），并处理 base64 图片
            full_html = SmartReportService._md_to_html(filled_md, use_simple_css=False, temp_dir=images_temp_dir)
            
            # 调试：保存 HTML 文件用于排查问题
            html_debug_path = pdf_path.replace('.pdf', '_debug.html')
            try:
                with open(html_debug_path, 'w', encoding='utf-8') as f:
                    f.write(full_html)
                logger.debug(f"调试 HTML 已保存: {html_debug_path}")
            except:
                pass
            
            # base_url 设置为图片临时目录，这样 WeasyPrint 可以找到转换后的图片文件
            HTML(string=full_html, base_url=images_temp_dir).write_pdf(pdf_path)
            
            # 验证 PDF 文件是否成功生成
            if not os.path.exists(pdf_path):
                raise Exception("PDF 文件不存在")
            
            file_size = os.path.getsize(pdf_path)
            if file_size == 0:
                raise Exception("PDF 文件为空")
            
            # 验证 PDF 文件头（PDF 文件应该以 %PDF- 开头）
            with open(pdf_path, 'rb') as f:
                header = f.read(8)
                if not header.startswith(b'%PDF-'):
                    raise Exception(f"PDF 文件格式无效，文件头: {header[:8]}")
            
            logger.info(f"WeasyPrint 成功生成 PDF: {pdf_path}, 大小: {file_size} 字节")
            pdf_success = True
        except ImportError:
            # WeasyPrint 未安装或依赖缺失，尝试回退方案
            pass
        except Exception as e:
            # WeasyPrint 安装但运行失败（通常是 Windows 上的 GTK+ 依赖问题）
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"WeasyPrint 生成 PDF 失败，尝试使用备用方案: {e}")
        
        # 方法2: 回退到 xhtml2pdf (纯 Python，无需外部依赖)
        if not pdf_success:
            try:
                from xhtml2pdf import pisa
                from io import BytesIO
                
                # 使用简化版 HTML（移除不支持的 CSS 特性），并处理 base64 图片
                simple_html = SmartReportService._md_to_html(filled_md, use_simple_css=True, temp_dir=images_temp_dir)
                
                # xhtml2pdf 的正确使用方式
                # 注意：需要将 HTML 中的相对路径转换为绝对路径，以便 xhtml2pdf 能找到图片
                import re
                def replace_img_path(match):
                    img_tag = match.group(0)
                    src_match = re.search(r'src=["\']([^"\']+)["\']', img_tag)
                    if src_match:
                        img_path = src_match.group(1)
                        # 如果是相对路径，转换为绝对路径
                        if not os.path.isabs(img_path):
                            abs_path = os.path.join(images_temp_dir, img_path)
                            if os.path.exists(abs_path):
                                return img_tag.replace(img_path, abs_path)
                    return img_tag
                
                # 替换所有 img 标签中的相对路径
                simple_html = re.sub(r'<img[^>]+>', replace_img_path, simple_html)
                
                # 调试：保存 HTML 文件用于排查问题
                import logging
                logger = logging.getLogger(__name__)
                html_debug_path = pdf_path.replace('.pdf', '_debug.html')
                try:
                    with open(html_debug_path, 'w', encoding='utf-8') as f:
                        f.write(simple_html)
                    logger.debug(f"调试 HTML 已保存: {html_debug_path}")
                except:
                    pass
                
                source_html = BytesIO(simple_html.encode('utf-8'))
                result_file = open(pdf_path, "w+b")
                
                # pisa.CreatePDF 的第一个参数是源 HTML，第二个参数是目标文件
                pisa_status = pisa.CreatePDF(source_html, result_file)
                
                result_file.close()
                source_html.close()
                
                if pisa_status.err == 0:
                    # 验证 PDF 文件是否成功生成
                    if not os.path.exists(pdf_path):
                        raise Exception("xhtml2pdf 生成的文件不存在")
                    
                    file_size = os.path.getsize(pdf_path)
                    if file_size == 0:
                        raise Exception("xhtml2pdf 生成的文件为空")
                    
                    # 验证 PDF 文件头（PDF 文件应该以 %PDF- 开头）
                    with open(pdf_path, 'rb') as f:
                        header = f.read(8)
                        if not header.startswith(b'%PDF-'):
                            raise Exception(f"PDF 文件格式无效，文件头: {header[:8]}")
                    
                    logger.info(f"xhtml2pdf 成功生成 PDF: {pdf_path}, 大小: {file_size} 字节")
                    pdf_success = True
                else:
                    error_msg = f"xhtml2pdf 生成失败，错误代码: {pisa_status.err}"
                    if hasattr(pisa_status, 'log') and pisa_status.log:
                        error_msg += f", 日志: {pisa_status.log}"
                    raise Exception(error_msg)
            except ImportError:
                import logging
                logger = logging.getLogger(__name__)
                logger.error("xhtml2pdf 未安装，无法生成 PDF。请运行: pip install xhtml2pdf")
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"PDF 生成失败 (WeasyPrint 和 xhtml2pdf 都失败): {e}")
        
        # 清理临时图片目录（暂时保留用于调试，生产环境应启用清理）
        # 注意：调试文件（_debug.html）和临时图片目录会保留，方便排查问题
        # 生产环境建议启用以下代码自动清理
        # if os.path.exists(images_temp_dir):
        #     try:
        #         import shutil
        #         shutil.rmtree(images_temp_dir)
        #     except Exception as e:
        #         import logging
        #         logger = logging.getLogger(__name__)
        #         logger.warning(f"清理临时图片目录失败: {e}")
        
        if not pdf_success:
            pdf_filename = None
            pdf_path = None
            # 如果 PDF 生成失败，抛出异常以便前端显示错误信息
            raise Exception(
                "PDF 生成失败：WeasyPrint 和 xhtml2pdf 都无法生成 PDF。"
                "在 Windows 系统上，WeasyPrint 需要安装 GTK+ 库。"
                "请确保已安装 xhtml2pdf: pip install xhtml2pdf"
            )

        result = {
            "pdf_path": pdf_path,
            "pdf_filename": pdf_relative_path,  # 返回包含子目录的相对路径
            "record_id": None,
            "is_archived": False  # 默认为临时目录
        }
        
        # 4. 保存记录（含全文内容，以便知识库管理）
        if save_record and record_name:
            try:
                # 复制文件到归档目录
                import shutil
                archive_pdf_path = os.path.join(archive_report_dir, pdf_filename)
                shutil.copy2(pdf_path, archive_pdf_path)
                
                # 清理 base64 图片数据，只保留文本内容（避免数据库存储过大）
                clean_content = SmartReportService._clean_base64_images(filled_md)
                
                record = AnalysisSmartReportRecord(
                    report_id=report.id,
                    name=record_name,
                    docx_file_path="",  # 新版本不再强制生成 Word
                    pdf_file_path=pdf_relative_path,  # 存储包含子目录的相对路径
                    full_content=clean_content  # 保存清理后的内容
                )
                db.add(record)
                await db.commit()
                await db.refresh(record)
                result["record_id"] = record.id
                result["is_archived"] = True
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"保存归档记录失败，仅保留临时文件: {e}")
                # 即使归档失败，临时文件仍然可用于下载
        
        return result

    @staticmethod
    async def preview_report(db: AsyncSession, report_id: int, data_context: Dict[str, Any]) -> Dict[str, str]:
        """预览报告（返回 HTML 内容）"""
        report = await SmartReportService.get_report(db, report_id)
        if not report:
            raise Exception("报告模板不存在")
            
        filled_md = SmartReportService._fill_variables(report.content_md or "", data_context)
        html_content = SmartReportService._md_to_html(filled_md)
        return {"html": html_content}

    @staticmethod
    async def get_records(db: AsyncSession, report_id: int) -> List[AnalysisSmartReportRecord]:
        """获取所有报告记录"""
        res = await db.execute(select(AnalysisSmartReportRecord).where(AnalysisSmartReportRecord.report_id == report_id).order_by(AnalysisSmartReportRecord.created_at.desc()))
        return res.scalars().all()

    @staticmethod
    async def get_record(db: AsyncSession, record_id: int) -> Optional[AnalysisSmartReportRecord]:
        """获取单个报告记录"""
        res = await db.execute(select(AnalysisSmartReportRecord).where(AnalysisSmartReportRecord.id == record_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def delete_record(db: AsyncSession, record_id: int):
        """删除报告记录及其关联的本地文件（包括临时图片目录和调试文件）"""
        import logging
        import shutil
        logger = logging.getLogger(__name__)
        
        record = await SmartReportService.get_record(db, record_id)
        if record:
            # 删除本地 PDF 文件及相关文件（临时目录和归档目录都检查）
            if record.pdf_file_path:
                for storage_dir in [TEMP_DIR, ARCHIVE_DIR]:
                    file_path = os.path.join(str(storage_dir), record.pdf_file_path)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            logger.info(f"已删除 PDF 文件: {file_path}")
                            
                            # 同时删除相关的调试文件和图片目录
                            file_dir = os.path.dirname(file_path)
                            file_base = os.path.basename(file_path).replace('.pdf', '')
                            
                            # 删除 debug.html 文件
                            debug_file = os.path.join(file_dir, f"{file_base}_debug.html")
                            if os.path.exists(debug_file):
                                os.remove(debug_file)
                                logger.info(f"已删除调试文件: {debug_file}")
                            
                            # 删除 images 目录
                            images_dir = os.path.join(file_dir, f"images_{file_base}")
                            if os.path.exists(images_dir):
                                shutil.rmtree(images_dir)
                                logger.info(f"已删除图片目录: {images_dir}")
                                
                        except Exception as e:
                            logger.warning(f"删除文件失败: {file_path}, 错误: {e}")
            
            # 删除本地 DOCX 文件（如果有）
            if record.docx_file_path:
                for storage_dir in [TEMP_DIR, ARCHIVE_DIR]:
                    file_path = os.path.join(str(storage_dir), record.docx_file_path)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            logger.info(f"已删除 DOCX 文件: {file_path}")
                        except Exception as e:
                            logger.warning(f"删除 DOCX 文件失败: {file_path}, 错误: {e}")
            
            # 删除数据库记录
            await db.delete(record)
            await db.commit()
