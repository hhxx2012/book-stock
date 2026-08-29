-- ========================================
-- 日志表诊断脚本（幂等版，可重复执行）
-- 在 Supabase SQL Editor 中执行此脚本
-- 用于排查日志不显示的问题
-- ========================================

-- ========== 1. 检查 logs 表是否存在 ==========
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'logs'
) AS logs_table_exists;

-- ========== 2. 检查 logs 表的字段结构 ==========
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'logs' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ========== 3. 检查 logs 表中是否有数据 ==========
SELECT COUNT(*) AS total_logs FROM logs;

-- ========== 4. 查看最新的 10 条日志 ==========
SELECT id, type, action, year, term, grade, subject, difficulty, campus, 
       book_name, quantity, operator_name, created_at
FROM logs
ORDER BY created_at DESC
LIMIT 10;

-- ========== 5. 检查 RLS 是否已关闭 ==========
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'logs';

-- ========== 6. 如果 logs 表不存在，创建它 ==========
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id TEXT,
  type TEXT NOT NULL,
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

-- ========== 7. 确保 RLS 已关闭 ==========
ALTER TABLE logs DISABLE ROW LEVEL SECURITY;

-- ========== 8. 检查 Realtime 发布中已有哪些表 ==========
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- ========== 9. 将需要的表加入 Realtime（幂等，已存在则跳过）==========
DO $$
BEGIN
  -- 逐个添加，已存在则忽略错误
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'stock 已在 Realtime 发布中，跳过';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE books;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'books 已在 Realtime 发布中，跳过';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE logs;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'logs 已在 Realtime 发布中，跳过';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE forecasts;
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'forecasts 已在 Realtime 发布中，跳过';
  END;
END $$;

-- ========== 10. 确认结果 ==========
SELECT '诊断完成' AS status;
