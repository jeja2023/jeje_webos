图文识别 (OCR) 模型文件
========================================

系统会自动尝试从网络下载所需的 OCR 模型文件。
但在某些网络环境下（如 NAS 无法访问 HuggingFace），自动下载可能会失败。

如果您遇到 OCR 无法使用的情况，请手动下载以下文件并放入此目录：

1. ch_PP-OCRv4_det_infer.onnx (检测模型)
   下载地址: https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx

2. ch_PP-OCRv4_rec_infer.onnx (中文识别模型)
   下载地址: https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx

3. ch_ppocr_mobile_v2.0_cls_infer.onnx (方向分类模型)
   下载地址: https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv1/ch_ppocr_mobile_v2.0_cls_infer.onnx

注意：
- 放入文件后，无需重启容器，下次识别时会自动加载。
- 系统同时支持英文识别 (en_PP-OCRv3_rec_infer.onnx)，如有需要可自行下载。
