-- Supabase 数据库迁移脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 启用 RLS (Row Level Security)
-- 注意：此项目使用简单的共享访问模式，不启用复杂的RLS策略

-- ==================== 用户表 ====================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  openid TEXT UNIQUE,
  user_name TEXT NOT NULL,
  nick_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  campus TEXT NOT NULL DEFAULT 'honghe',
  campus_name TEXT,
  roles TEXT[] DEFAULT ARRAY['teacher'],
  campuses TEXT[] DEFAULT ARRAY['honghe'],
  password TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 角色配置表 ====================
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 角色权限表 ====================
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT UNIQUE NOT NULL,
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 年级表 ====================
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 科目表 ====================
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 难度表 ====================
CREATE TABLE IF NOT EXISTS difficulties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 书本表 ====================
CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_name TEXT NOT NULL,
  book_code TEXT,
  year TEXT NOT NULL,
  term TEXT NOT NULL,
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  difficulty TEXT,
  total_quantity INTEGER DEFAULT 0,
  honghe_quantity INTEGER DEFAULT 0,
  longhua_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(year, term, grade, subject, difficulty)
);

-- ==================== 库存表 ====================
CREATE TABLE IF NOT EXISTS stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus TEXT NOT NULL,
  campus_name TEXT,
  year TEXT NOT NULL,
  term TEXT NOT NULL,
  grade TEXT NOT NULL,
  subject TEXT NOT NULL,
  difficulty TEXT,
  book_name TEXT NOT NULL,
  book_code TEXT,
  total_quantity INTEGER DEFAULT 0,
  honghe_quantity INTEGER DEFAULT 0,
  longhua_quantity INTEGER DEFAULT 0,
  total_in INTEGER DEFAULT 0,
  total_out INTEGER DEFAULT 0,
  remaining_stock INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campus, year, term, grade, subject, difficulty)
);

-- ==================== 预计/领取表 ====================
CREATE TABLE IF NOT EXISTS forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'forecast', -- forecast / receive
  book_name TEXT,
  year TEXT,
  term TEXT,
  grade TEXT,
  subject TEXT,
  difficulty TEXT,
  campus TEXT,
  campus_name TEXT,
  quantity INTEGER DEFAULT 0,
  remark TEXT,
  status TEXT DEFAULT 'pending', -- pending / processed
  operator TEXT,
  operator_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 日志表 ====================
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id TEXT,
  type TEXT NOT NULL, -- stock_in / stock_out
  operator TEXT,
  operator_name TEXT,
  action TEXT,
  detail TEXT,
  year TEXT,
  term TEXT,
  grade TEXT,
  subject TEXT,
  difficulty TEXT,
  campus TEXT,
  book_name TEXT,
  quantity INTEGER DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 系统设置表 ====================
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==================== 插入默认数据 ====================

-- 默认角色
INSERT INTO roles (role, label, permissions) VALUES
  ('super', '超级管理员', ARRAY['view_stock','stock_in','stock_out','delete_book','forecast_view','forecast_set','forecast_approve','forecast_modify','forecast_delete','forecast_stats','receive_view','receive_set','receive_approve','receive_modify','receive_delete','manage_books','manage_users','manage_roles','manage_system','view_stats','qrcode_generate']),
  ('admin', '管理员', ARRAY['view_stock','stock_in','stock_out','delete_book','forecast_view','forecast_set','forecast_approve','forecast_modify','forecast_delete','forecast_stats','receive_view','receive_set','receive_approve','receive_modify','receive_delete','manage_books','manage_users','manage_system','view_stats','qrcode_generate']),
  ('educational', '教务', ARRAY['view_stock','stock_in','stock_out','forecast_view','forecast_set','forecast_approve','forecast_modify','receive_view','receive_set','receive_approve','receive_modify','qrcode_generate']),
  ('teacher', '教师', ARRAY['view_stock','forecast_view','receive_view','qrcode_generate'])
ON CONFLICT (role) DO NOTHING;

-- 默认年级
INSERT INTO grades (name, sort_order) VALUES
  ('幼小', 0),
  ('1年级', 1),
  ('2年级', 2),
  ('3年级', 3),
  ('4年级', 4),
  ('5年级', 5),
  ('6年级', 6),
  ('初一', 7),
  ('初二', 8),
  ('初三', 9)
ON CONFLICT (name) DO NOTHING;

-- 默认科目
INSERT INTO subjects (name, sort_order) VALUES
  ('语文', 1),
  ('数学', 2),
  ('英语', 3),
  ('物理', 4),
  ('化学', 5),
  ('生物', 6),
  ('历史', 7),
  ('地理', 8),
  ('政治', 9)
ON CONFLICT (name) DO NOTHING;

-- 默认难度
INSERT INTO difficulties (name, sort_order) VALUES
  ('无', 0),
  ('基础', 1),
  ('培优', 2),
  ('尖子', 3)
ON CONFLICT (name) DO NOTHING;

-- 默认系统设置
INSERT INTO system_settings (key, value) VALUES
  ('default_year', '2026'),
  ('default_term', '暑期')
ON CONFLICT (key) DO NOTHING;

-- 创建更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要 updated_at 的表添加触发器
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_books_updated_at') THEN
        CREATE TRIGGER update_books_updated_at BEFORE UPDATE ON books FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_stock_updated_at') THEN
        CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON stock FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_forecasts_updated_at') THEN
        CREATE TRIGGER update_forecasts_updated_at BEFORE UPDATE ON forecasts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_role_permissions_updated_at') THEN
        CREATE TRIGGER update_role_permissions_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_settings_updated_at') THEN
        CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
