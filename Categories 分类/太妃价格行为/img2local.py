import re
import os
import requests
import glob

def main():
    md_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(md_dir, 'assets')
    os.makedirs(assets_dir, exist_ok=True)
    md_files = glob.glob(os.path.join(md_dir, 'L*.md'))
    url_pat = re.compile(r'!\[.*?\]\((https?://.*?)\)')
    for md_file in md_files:
        with open(md_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        new_lines = []
        for line in lines:
            m = url_pat.search(line)
            if m:
                url = m.group(1)
                ext = url.split('?')[0].split('.')[-1]
                if len(ext) > 5 or '/' in ext:
                    ext = 'jpg'
                fname = os.path.basename(url.split('?')[0].split('/')[-1])
                if not fname or '.' not in fname:
                    fname = 'img_' + str(abs(hash(url))) + '.' + ext
                local_path = 'assets/' + fname
                img_path = os.path.join(assets_dir, fname)
                if not os.path.exists(img_path):
                    try:
                        r = requests.get(url, timeout=10)
                        with open(img_path, 'wb') as imgf:
                            imgf.write(r.content)
                    except Exception as e:
                        print(f'下载失败: {url} -> {e}')
                line = line.replace(url, local_path)
            new_lines.append(line)
        with open(md_file, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

if __name__ == '__main__':
    main()
