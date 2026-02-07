# -*- coding: utf-8 -*-

"""

LM Cleaner 模块测试用例

"""



import os

from pathlib import Path

import pytest

import numpy as np

import cv2

import fitz

from modules.lm_cleaner.lm_cleaner_services import LmCleanerService

from modules.lm_cleaner.lm_cleaner_schemas import LmCleanerCreate





class TestLmCleanerService:

    """LmCleaner 服务层测试"""

    

    @pytest.fixture

    async def sample_user_id(self, db_session, test_user_data):

        """创建测试用户并返回用户ID"""

        from tests.test_conftest import create_test_user

        user = await create_test_user(db_session, test_user_data)

        return user["id"]



    @pytest.mark.asyncio

    async def test_create_record(self, db_session, sample_user_id):

        """测试创建处理记录"""

        data = LmCleanerCreate(

            title="test_image.png",

            content="/path/to/cleaned_test.png",

            source_file="/path/to/source_test.png"

        )

        result = await LmCleanerService.create(db_session, sample_user_id, data)

        

        assert result is not None

        assert result.title == "test_image.png"

        assert result.user_id == sample_user_id

        assert result.content == "/path/to/cleaned_test.png"

    

    @pytest.mark.asyncio

    async def test_get_by_id(self, db_session, sample_user_id):

        """测试根据ID获取记录"""

        # 先创建

        data = LmCleanerCreate(title="get_test.pdf", content="/path/to/cleaned.pdf")

        item = await LmCleanerService.create(db_session, sample_user_id, data)

        

        # 再获取

        result = await LmCleanerService.get_by_id(db_session, item.id, sample_user_id)

        

        assert result is not None

        assert result.id == item.id

        assert result.title == "get_test.pdf"

    

    @pytest.mark.asyncio

    async def test_get_by_id_not_found(self, db_session, sample_user_id):

        """测试获取不存在的记录"""

        result = await LmCleanerService.get_by_id(db_session, 99999, sample_user_id)

        assert result is None

    

    @pytest.mark.asyncio

    async def test_get_list(self, db_session, sample_user_id):

        """测试获取记录列表"""

        # 创建几条记录

        for i in range(3):

            data = LmCleanerCreate(title=f"list_test_{i}.png", content=f"/path/to/cleaned_{i}.png")

            await LmCleanerService.create(db_session, sample_user_id, data)

        

        # 获取列表

        items, total = await LmCleanerService.get_list(db_session, sample_user_id)

        

        assert total >= 3

        assert len(items) >= 3

    

    @pytest.mark.asyncio

    async def test_get_list_with_keyword(self, db_session, sample_user_id):

        """测试关键词搜索"""

        # 创建测试数据

        data1 = LmCleanerCreate(title="apple_image.png", content="/path/1.png")

        data2 = LmCleanerCreate(title="banana_image.png", content="/path/2.png")

        await LmCleanerService.create(db_session, sample_user_id, data1)

        await LmCleanerService.create(db_session, sample_user_id, data2)

        

        # 搜索

        items, total = await LmCleanerService.get_list(db_session, sample_user_id, keyword="apple")

        

        assert total >= 1

        assert any("apple" in item.title for item in items)

    

    @pytest.mark.asyncio  

    async def test_delete_record(self, db_session, sample_user_id):

        """测试删除记录"""

        # 先创建（不使用真实文件路径）

        data = LmCleanerCreate(title="delete_test.png", content="/nonexistent/path.png")

        item = await LmCleanerService.create(db_session, sample_user_id, data)

        item_id = item.id

        

        # 再删除

        result = await LmCleanerService.delete(db_session, item_id, sample_user_id)

        # delete 方法返回 True 表示成功

        assert result

        

        # 验证已删除

        check = await LmCleanerService.get_by_id(db_session, item_id, sample_user_id)

        assert check is None



    @pytest.mark.asyncio

    async def test_process_image(self, tmp_workspace, sample_user_id):

        """测试处理图片去水印"""

        # 创建测试输入目录

        input_dir = tmp_workspace["temp_dir"] / "inputs"

        input_dir.mkdir(parents=True, exist_ok=True)

        

        # 1. 创建一个测试图片 (白色背景 + 右下角文字)

        input_filename = "test_image.png"

        input_path = input_dir / input_filename

        

        img = np.ones((200, 200, 3), dtype=np.uint8) * 255

        # 在右下角添加类似水印的文字

        cv2.putText(img, "NotebookLM", (120, 190), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (50, 50, 50), 1)

        

        # 使用 imencode + tofile 处理中文路径（如果有的话，这里虽然是英文）

        _, buffer = cv2.imencode(".png", img)

        buffer.tofile(str(input_path))

        

        # 2. 执行处理

        output_path_str = await LmCleanerService.process_file(str(input_path), input_filename, sample_user_id)

        

        # 3. 验证结果

        assert os.path.exists(output_path_str)

        assert "cleaned_" in output_path_str

        

        # 读取处理后的图片，验证右下角是否被处理（简单验证：右下角应该变白了）

        cleaned_img = cv2.imdecode(np.fromfile(output_path_str, dtype=np.uint8), cv2.IMREAD_COLOR)

        # 检查右下角区域的平均颜色，应该是白色 (255, 255, 255)

        roi = cleaned_img[180:200, 150:200]

        mean_color = np.mean(roi, axis=(0, 1))

        assert np.all(mean_color > 240) # 接近白色



    @pytest.mark.asyncio

    async def test_process_pdf(self, tmp_workspace, sample_user_id):

        """测试处理 PDF 去水印"""

        # 创建测试输入目录

        input_dir = tmp_workspace["temp_dir"] / "inputs"

        input_dir.mkdir(parents=True, exist_ok=True)

        

        # 1. 创建一个测试 PDF

        input_filename = "test.pdf"

        input_path = input_dir / input_filename

        

        doc = fitz.open()

        page = doc.new_page(width=500, height=500)

        page.insert_text((50, 50), "Test PDF Content")

        # 右下角水印

        page.insert_text((400, 480), "NotebookLM", color=(0.2, 0.2, 0.2))

        doc.save(str(input_path))

        doc.close()

        

        # 2. 执行处理

        output_path_str = await LmCleanerService.process_file(str(input_path), input_filename, sample_user_id)

        

        # 3. 验证结果

        assert os.path.exists(output_path_str)

        assert output_path_str.endswith(".pdf")

        

        # 验证处理后的 PDF 还能打开

        out_doc = fitz.open(output_path_str)

        assert len(out_doc) == 1

        out_doc.close()

