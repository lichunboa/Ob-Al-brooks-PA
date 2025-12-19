import os
import re
def format_markdown(md_text):
    # 1. 统一图片/链接格式
    md_text = re.sub(r'!\[\s*(.*?)\s*\]\(\s*(.*?)\s*\)', r'![\1](\2)', md_text)
    md_text = re.sub(r'\[\s*(.*?)\s*\]\(\s*(.*?)\s*\)', r'[\1](\2)', md_text)
    # 2. 代码块格式
    md_text = re.sub(r'(```[a-zA-Z]*\n[\s\S]*?\n```)', lambda m: m.group(1).strip()+'\n', md_text)
    # 3. 自动推断并优化标题层级
    lines = md_text.split('\n')
    new_lines = []
    last_level = 0
    for i, line in enumerate(lines):
        m = re.match(r'^(#+)\s*(.*)', line)
        if m:
            content = m.group(2)
            prev_level = last_level
            if i > 0:
                for j in range(i-1, -1, -1):
                    prev = lines[j]
                    m_prev = re.match(r'^(#+)\s*(.*)', prev)
                    if m_prev:
                        prev_level = len(m_prev.group(1))
                        break
            cur_level = prev_level
            num_match = re.match(r'^(\d+)[\）\.]', content)
            prev_num_match = None
            if i > 0:
                prev_content = lines[i-1]
                prev_num_match = re.match(r'^(#+)\s*(\d+)[\）\.]', prev_content)
            if num_match and prev_num_match:
                cur_num = int(num_match.group(1))
                prev_num = int(prev_num_match.group(2))
                if cur_num > prev_num:
                    cur_level = prev_level + 1 if prev_level < 6 else 6
                elif cur_num < prev_num:
                    cur_level = max(prev_level - 1, 1)
            cur_level = min(max(cur_level, 1), 6)
            new_lines.append('#' * cur_level + ' ' + content)
            last_level = cur_level
        else:
            new_lines.append(line)
    # 4. 彻底优化空行和不可见字符处理：
    def clean_invisible(s):
        # 去除BOM、零宽空格、特殊空格等
        return s.replace('\ufeff', '').replace('\u200b', '').replace('\u200c', '').replace('\u200d', '').replace('\u00a0', '').strip()

    cleaned_lines = []
    i = 0
    n = len(new_lines)
    while i < n:
        line = clean_invisible(new_lines[i].rstrip())
        # 标题后直接跟内容，不留空行
        if re.match(r'^#+ ', line):
            cleaned_lines.append(line)
            # 跳过标题后所有空行和不可见字符
            j = i + 1
            while j < n and clean_invisible(new_lines[j]) == '':
                j += 1
            i = j
            continue
        # 普通空行处理：只保留一行
        if line == '':
            if cleaned_lines and cleaned_lines[-1] == '':
                i += 1
                continue
            cleaned_lines.append('')
        else:
            cleaned_lines.append(line)
        i += 1
    # 去除首尾空行
    while cleaned_lines and cleaned_lines[0] == '':
        cleaned_lines.pop(0)
    while cleaned_lines and cleaned_lines[-1] == '':
        cleaned_lines.pop()
    md_text = '\n'.join(cleaned_lines)
    return md_text

def format_all_md(root_dir):
    for root, _, files in os.walk(root_dir):
        for fname in files:
            if fname.endswith('.md'):
                fpath = os.path.join(root, fname)
                with open(fpath, 'r', encoding='utf-8') as f:
                    content = f.read()
                new_content = format_markdown(content)
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(new_content)

if __name__ == '__main__':
    # 修改为你的根目录
    format_all_md(os.path.dirname(os.path.abspath(__file__)))
