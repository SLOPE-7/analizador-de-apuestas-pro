export async function analyzeWithAI(payload: any) {
  const response = await fetch('/api/ai-analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  return response.json()
}