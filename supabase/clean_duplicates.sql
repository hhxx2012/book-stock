-- ========================================
-- 数据清理脚本：清理重复的日志和库存记录
-- 在 Supabase SQL Editor 中执行
-- ========================================

-- ========== 1. 检查 logs 表中是否有重复记录 ==========
-- 用业务字段判断重复（同一次操作可能因bug产生了两条日志）
SELECT type, year, term, grade, subject, difficulty, campus, quantity, action,
       COUNT(*) AS dup_count
FROM logs
GROUP BY type, year, term, grade, subject, difficulty, campus, quantity, action
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- ========== 2. 删除重复的日志记录（保留最新一条）==========
DELETE FROM logs
WHERE id NOT IN (
  SELECT DISTINCT ON (type, year, term, grade, subject, difficulty, campus, quantity, action)
    id
  FROM logs
  ORDER BY type, year, term, grade, subject, difficulty, campus, quantity, action, created_at DESC
);

-- ========== 3. 确认日志已去重 ==========
SELECT COUNT(*) AS total_logs_after_dedup FROM logs;

-- ========== 4. 检查 stock 表中是否有重复记录 ==========
-- 同一校区同一本书应该只有一条记录
SELECT campus, year, term, grade, subject, difficulty,
       COUNT(*) AS dup_count
FROM stock
GROUP BY campus, year, term, grade, subject, difficulty
HAVING COUNT(*) > 1
ORDER BY dup_count DESC;

-- ========== 5. 如果有重复的 stock 记录，合并数量后删除多余的 ==========
-- 先查看重复记录详情
SELECT id, campus, year, term, grade, subject, difficulty,
       total_in, total_out, remaining_stock, created_at
FROM stock
WHERE (campus, year, term, grade, subject, difficulty) IN (
  SELECT campus, year, term, grade, subject, difficulty
  FROM stock
  GROUP BY campus, year, term, grade, subject, difficulty
  HAVING COUNT(*) > 1
)
ORDER BY campus, year, term, grade, subject, difficulty, created_at;

-- ⚠️ 注意：如果上方查询返回了结果，说明 stock 表有重复记录
-- 需要手动处理：保留 created_at 最新的一条，把其他记录的 total_in/total_out 合并过去
-- 然后删除旧记录。以下 SQL 自动处理（请确认后再执行）：

-- 6. 合并重复的 stock 记录（保留最新，累加出入库数量）
-- 谨慎执行：如果数据不对，可以跳过这步，手动在管理界面修正
DO $$
DECLARE
  dup_record RECORD;
  keep_id UUID;
  merged_total_in INTEGER;
  merged_total_out INTEGER;
  merged_remaining INTEGER;
BEGIN
  FOR dup_record IN
    SELECT campus, year, term, grade, subject, difficulty
    FROM stock
    GROUP BY campus, year, term, grade, subject, difficulty
    HAVING COUNT(*) > 1
  LOOP
    -- 计算合并后的总入库和总出库
    SELECT COALESCE(SUM(total_in), 0), COALESCE(SUM(total_out), 0)
    INTO merged_total_in, merged_total_out
    FROM stock
    WHERE campus = dup_record.campus
      AND year = dup_record.year
      AND term = dup_record.term
      AND grade = dup_record.grade
      AND subject = dup_record.subject
      AND COALESCE(difficulty, '') = COALESCE(dup_record.difficulty, '');

    merged_remaining := merged_total_in - merged_total_out;

    -- 找到最新的一条记录作为保留记录
    SELECT id INTO keep_id
    FROM stock
    WHERE campus = dup_record.campus
      AND year = dup_record.year
      AND term = dup_record.term
      AND grade = dup_record.grade
      AND subject = dup_record.subject
      AND COALESCE(difficulty, '') = COALESCE(dup_record.difficulty, '')
    ORDER BY created_at DESC
    LIMIT 1;

    -- 更新保留记录的数量
    UPDATE stock
    SET total_in = merged_total_in,
        total_out = merged_total_out,
        remaining_stock = merged_remaining,
        total_quantity = merged_remaining
    WHERE id = keep_id;

    -- 删除其他重复记录
    DELETE FROM stock
    WHERE campus = dup_record.campus
      AND year = dup_record.year
      AND term = dup_record.term
      AND grade = dup_record.grade
      AND subject = dup_record.subject
      AND COALESCE(difficulty, '') = COALESCE(dup_record.difficulty, '')
      AND id != keep_id;

    RAISE NOTICE '合并完成: % % % % % %', dup_record.campus, dup_record.year, dup_record.term, dup_record.grade, dup_record.subject, dup_record.difficulty;
  END LOOP;
END $$;

-- ========== 7. 确认 stock 已无重复 ==========
SELECT campus, year, term, grade, subject, difficulty,
       COUNT(*) AS cnt
FROM stock
GROUP BY campus, year, term, grade, subject, difficulty
HAVING COUNT(*) > 1;

-- ========== 8. 添加唯一约束防止未来重复 ==========
-- 如果还没有唯一约束，添加一个
DO $$
BEGIN
  -- 尝试添加唯一约束，如果已存在则跳过
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'stock_unique_record'
  ) THEN
    ALTER TABLE stock 
    ADD CONSTRAINT stock_unique_record 
    UNIQUE (campus, year, term, grade, subject, difficulty);
    RAISE NOTICE '唯一约束已添加';
  ELSE
    RAISE NOTICE '唯一约束已存在，跳过';
  END IF;
END $$;

-- ========== 9. 确认结果 ==========
SELECT '清理完成' AS status;
SELECT '剩余日志数: ' || COUNT(*) AS info FROM logs;
SELECT '剩余库存数: ' || COUNT(*) AS info FROM stock;
