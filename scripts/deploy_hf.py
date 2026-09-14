# -*- coding: utf-8 -*-
import os
import sys
from huggingface_hub import HfApi

def deploy(token, repo_id):
    if not token or not repo_id:
        print('[!] 錯誤：請提供 Hugging Face Token (hf_...) 與 Repo ID (使用者名稱/Space名稱)')
        return False
        
    api = HfApi(token=token)
    
    print('========================================================================')
    print(f'[*] 正在連線 Hugging Face 並建立/驗證 Space: {repo_id} ...')
    try:
        api.create_repo(
            repo_id=repo_id,
            repo_type='space',
            space_sdk='docker',
            private=False,
            exist_ok=True
        )
        print(f'[OK] Space 空間已就緒: https://huggingface.co/spaces/{repo_id}')
    except Exception as e:
        print(f'[*] 建立 Space 回應: {e}')

    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print('[*] 正在上傳專案全部圖資 (含 152MB 人行道)、前端介面與 Dockerfile ...')
    print('    (因包含完整空間圖資，首次上傳約需 1~2 分鐘，請稍候...)')
    
    try:
        api.upload_folder(
            folder_path=root_dir,
            repo_id=repo_id,
            repo_type='space',
            ignore_patterns=[
                '.git*',
                '__pycache__*',
                '*.pyc',
                '*.docx',
                '*.pdf',
                'scratch*',
                '*.bat',
                'docs*'
            ],
            token=token
        )
        print('========================================================================')
        print('[🎉 部署完成] 專案已成功推送到 Hugging Face Spaces！')
        print(f'1. 查看 Space 構建日誌與運行狀態: https://huggingface.co/spaces/{repo_id}')
        
        parts = repo_id.strip().split('/')
        if len(parts) == 2:
            username, space_name = parts
            subdomain = f'{username}-{space_name}'.replace('_', '-').lower()
            print(f'2. 全螢幕獨立公開網址: https://{subdomain}.hf.space')
        print('========================================================================')
        return True
    except Exception as e:
        print(f'[!] 上傳失敗: {e}')
        return False

if __name__ == '__main__':
    token = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HF_TOKEN')
    repo_id = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('HF_REPO_ID')
    
    if not token or not repo_id:
        print('使用方式: python scripts/deploy_hf.py <HF_TOKEN> <USERNAME/SPACE_NAME>')
        sys.exit(1)
        
    deploy(token, repo_id)
