PYTHON ?= .venv/bin/python
PIP ?= .venv/bin/pip

.PHONY: help venv install install-dev lint format syntax clean

help:
	@echo "make venv        # 创建 .venv"
	@echo "make install     # 安装运行依赖"
	@echo "make install-dev # 安装开发依赖"
	@echo "make lint        # Ruff 检查"
	@echo "make format      # Ruff 格式化"
	@echo "make syntax      # Python 语法检查"
	@echo "make clean       # 清理缓存"

venv:
	python3 -m venv .venv
	$(PIP) install --upgrade pip wheel setuptools

install: venv
	$(PIP) install -r requirements.txt

install-dev: venv
	$(PIP) install -r requirements-dev.txt

lint:
	$(PYTHON) -m ruff check runtime tools libs

format:
	$(PYTHON) -m ruff format runtime tools libs

syntax:
	$(PYTHON) -m py_compile runtime/pa_runtime.py runtime/providers.py tools/chart_gen.py tools/patrol_ab_context.py tools/patrol_trade.py tools/pa_crypto_control.py

clean:
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type f -name '*.pyc' -delete
