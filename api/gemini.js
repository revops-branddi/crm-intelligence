// Legacy unauthenticated endpoint retired. AI access goes through /api/intelligence.
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res
    .status(410)
    .json({
      error: 'Atualize o aplicativo para usar a análise autenticada.',
      code: 'endpoint_retired',
    });
}
