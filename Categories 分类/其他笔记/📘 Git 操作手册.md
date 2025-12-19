
Markdown

````
# 📘 Git 版本控制完全操作手册

> [!IMPORTANT] 核心原则：所有的终端命令，必须在你的【项目根目录】下执行！
> **如何进入目录？**
> 1. 打开终端 (Terminal)。
> 2. 输入 `cd` (后面加个空格)。
> 3. 把你的 Obsidian 库文件夹拖进终端窗口，路径会自动生成。
> 4. 按回车。

````
---

## 一、 🚀 第一次设置 (初始化)
*仅在项目刚开始时做一次。*

### 1. 初始化仓库
```bash
git init
# 重命名主分支为 main (现在的标准)
git branch -m main
````

### 2. 配置忽略文件 (至关重要！)

防止同步视频、大图片、系统垃圾文件。 **操作：** 在根目录新建一个名为 `.gitignore` 的文件 (不要带 .txt 后缀)，填入以下内容：

程式碼片段

```
# --- 忽略系统文件 ---
.DS_Store
Thumbs.db

# --- 忽略 Obsidian 缓存与工作区 (防冲突) ---
.obsidian/cache
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/workspace-leaf.json

# --- 忽略大文件 (防爆仓) ---
*.mp4
*.mov
*.avi
*.pdf  # 如果PDF很大建议忽略
Attachments/  # 建议：如果附件很大，直接忽略整个附件文件夹
```

### 3. 关联远程仓库 (GitHub)

Bash

```
# origin 是远程仓库的别名，后面换成你自己的 GitHub 地址
git remote add origin [https://github.com/你的用户名/仓库名.git](https://github.com/你的用户名/仓库名.git)
```

---

## 二、 🔄 日常同步流程 (三部曲)

_当你修改了笔记，想手动备份时。_

### 1. 暂存 (Add)

把所有变动放入“暂存区”。

Bash

```
git add .
```

### 2. 提交 (Commit)

把暂存区的东西打包成一个版本。

Bash

```
# -m 后面是备注信息，可以随便写
git commit -m "日常更新: 优化了笔记结构"
```

### 3. 推送 (Push)

把版本上传到 GitHub。

Bash

```
git push
```

> [!failure] 如果报错 "No upstream branch" 第一次推送需要绑定分支，请用这个命令： `git push -u origin main`

---

## 三、 🌿 分支管理 (多线操作)

_当你想要尝试新功能，或者改动很大不想影响主笔记时。_

### 1. 创建并切换到副分支

例如创建一个叫 `dev` 的分支：

Bash

```
git switch -c dev
```

### 2. 推送副分支

Bash

```
# 第一次推送这个新分支
git push -u origin dev
```

### 3. 切回主分支

Bash

```
git switch main
```

### 4. 合并分支 (把副分支的内容合到主分支)

确保你当前在 `main` 分支下：

Bash

```
# 把 dev 的内容合过来
git merge dev
# 推送合并后的结果
git push
```

---

## 四、 🚑 紧急救援 (报错处理)

### 🔴 情况 A：不小心 Commit 了大文件，推送失败

**症状**：`Push rejected`，提示文件超过 100MB。 **修复步骤**：

1. **确保 `.gitignore` 已经写好了忽略规则**。
    
2. **清空暂存区缓存** (不会删本地文件)：
    
    Bash
    
    ```
    git rm -r --cached .
    ```
    
3. **重新添加** (这次会自动忽略大文件)：
    
    Bash
    
    ```
    git add .
    ```
    
4. **覆盖上次错误的提交**：
    
    Bash
    
    ```
    git commit --amend -m "修复: 移除大文件"
    ```
    
5. **强制推送**：
    
    Bash
    
    ```
    git push -f origin main
    ```
    

### 🟠 情况 B：远程仓库有变动，本地推不上去

**症状**：`Updates were rejected`，提示 `fetch first`。 **原因**：你在另一台电脑修改了笔记，或者 GitHub 上有点东西（如 Readme）。 **修复**：

**方法 1 (推荐)：先拉取，再推送**

Bash

```
git pull --rebase origin main
git push
```

**方法 2 (暴力)：强制覆盖远程 (慎用！)** _只有当你确定以**当前电脑**的内容为准，不想要远程的内容时使用。_

Bash

```
git push -f origin main
```

### 🟡 情况 C：.gitignore 不生效

**原因**：通常是因为文件名为 `.gitignore.txt` 或者文件已经被 Git 追踪了。 **修复**：

1. 重命名文件：`mv .gitignore.txt .gitignore`
    
2. 清理缓存：`git rm -r --cached .`
    
3. 重新添加：`git add .`
    

---

## 五、 💡 常用查询命令

- **查看状态** (看哪些文件变了)：`git status`
    
- **查看历史** (看提交记录)：`git log --oneline`
    
- **查看当前分支**：`git branch`
    

```

### 💡 建议
把这个存到你的 Obsidian 里，给它打个标签 `#Git` 或 `#教程`。下次遇到红色报错，直接按 `Cmd + O` 搜
```