const express = require('express');
const { getBlogPosts } = require('../../lib/bigcommerce');

const router = express.Router();

/**
 * GET /api/news?limit=
 * BigCommerce のブログ投稿(お知らせ)を新しい順で返す。
 * ※ トークンに Content(Read-only) スコープが必要。
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const posts = await getBlogPosts(limit);
    res.json({ news: posts });
  } catch (error) {
    const status = error.response && error.response.status;
    console.error('News error:', status, error.message);
    // Content スコープ未付与(403)や未設定でも画面を壊さないよう空で返す
    res.json({ news: [], error: status === 403 ? 'content_scope_required' : 'failed' });
  }
});

module.exports = router;
