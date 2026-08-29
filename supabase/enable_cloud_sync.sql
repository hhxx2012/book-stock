-- ========================================
-- 云端同步配置脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ========================================

-- 关闭所有表的 RLS（行级安全），允许已认证用户读写
-- 本系统使用共享认证模式，所有登录用户共享同一 Supabase 账号

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE difficulties DISABLE ROW LEVEL SECURITY;
ALTER TABLE books DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts DISABLE ROW LEVEL SECURITY;
ALTER TABLE logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- 确认 RLS 已关闭
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users','roles','role_permissions','grades','subjects','difficulties','books','stock','forecasts','logs','system_settings');

-- ========================================
-- 另外还需要在 Supabase 控制台操作：
-- 1. 进入 Authentication → Settings
-- 2. 关闭 "Confirm email"（邮箱确认）选项
-- 3. 保存设置
-- 
-- 这是为了让共享账号 app@book.app 能够自动注册并立即使用，
-- 不需要邮箱确认即可建立云端连接。
-- ========================================
