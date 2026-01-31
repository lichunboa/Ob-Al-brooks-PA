#!/usr/bin/env node

/**
 * Polymarket Signal Bot - 命令行启动器
 * 可打包成 EXE 的版本
 */

const path = require('path');
const fs = require('fs');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 Polymarket Signal Bot');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 检查配置文件
// 统一使用 tradecat/config/.env
const projectRoot = path.resolve(__dirname, '../../../../../');
const envPath = path.join(projectRoot, 'config', '.env');
if (!fs.existsSync(envPath)) {
    console.log('⚠️  配置文件不存在');
    console.log('');
    console.log('请先配置 tradecat/config/.env:');
    console.log('1. cp config/.env.example config/.env');
    console.log('2. 编辑 config/.env 填入 BOT_TOKEN 等配置');
    console.log('');
    console.log('路径:', envPath);

    console.log('');
    console.log('配置完成后,请重新运行本程序');
    console.log('');
    process.exit(0);
}

// 启动 Bot
console.log('🚀 启动中...\n');

try {
    require('./src/bot.js');
} catch (error) {
    console.error('❌ 启动失败:', error.message);
    console.error('');
    console.error('详细错误:');
    console.error(error.stack);
    process.exit(1);
}
