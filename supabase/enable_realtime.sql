-- ========================================
-- 开启 Supabase Realtime 实时同步
-- 在 Supabase SQL Editor 中执行此脚本
-- ========================================

-- 将需要实时同步的表添加到 supabase_realtime 发布中
ALTER PUBLICATION supabase_realtime ADD TABLE stock;
ALTER PUBLICATION supabase_realtime ADD TABLE books;
ALTER PUBLICATION supabase_realtime ADD TABLE logs;
ALTER PUBLICATION supabase_realtime ADD TABLE forecasts;

-- 确认结果
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
