FROM python:3.11-slim

# 安裝 GDAL, GEOS, PROJ 空間運算依賴
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgdal-dev \
    gdal-bin \
    libgeos-dev \
    libproj-dev \
    git \
    git-lfs \
    && rm -rf /var/lib/apt/lists/*

# 依照 Hugging Face Spaces 規範設定非 root 使用者 (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH

WORKDIR /home/user/app

# 安裝 Python 相依套件
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# 複製專案全部圖資、前端與伺服器程式
COPY --chown=user:user . .

# Hugging Face Spaces 預設應用程式監聽連接埠 7860
ENV PORT=7860
ENV HOST=0.0.0.0

EXPOSE 7860

# 啟動空間分析與 WebGIS 伺服器
CMD ["python", "server/analysis_service.py"]
