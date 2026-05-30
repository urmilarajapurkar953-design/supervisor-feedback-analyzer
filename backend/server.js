import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend server is running smoothly!' });
});

app.post('/api/analyze', async (req, res) => {
  const { transcript } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: 'No transcript provided.' });
  }

  const systemPrompt = `You are a strict data extraction API. Analyze the supervisor feedback transcript provided below.
You MUST return your response as a single, valid JSON object matching the schema perfectly.
Do not include any conversational filler, introductory comments, or markdown formatting tags. Just output the raw JSON string.

Schema:
{
  "extractedEvidence": [
    { "quote": "verbatim text from transcript", "sentiment": "Positive" }
  ],
  "rubricEvaluation": {
    "suggestedScore": 7,
    "justification": "One paragraph objective justification summarizing performance based on quotes."
  },
  "kpiMapping": ["KPI Name 1", "KPI Name 2"],
  "gapAnalysis": ["Missing operational item 1", "Missing operational item 2"],
  "suggestedFollowUp": ["Question 1", "Question 2", "Question 3"]
}

Transcript:
"${transcript.replace(/"/g, '\\"')}"`;

  try {
    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: systemPrompt,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama service returned status code: ${ollamaResponse.status}`);
    }

    const data = await ollamaResponse.json();
    const rawText = data.response.trim();

    console.log("--- RAW LLM OUTPUT RECEIVED ---");
    console.log(rawText);
    console.log("-------------------------------");

   
    const jsonMatch = rawText.match(/(\{[\s\S]*\})/);
    
    if (!jsonMatch) {
      throw new Error("Could not extract a valid JSON block from the model's response.");
    }

    const parsedAnalysis = JSON.parse(jsonMatch[1].trim());
    
    res.json(parsedAnalysis);

  } catch (error) {
    console.error("❌ Backend processing error:", error);
    res.status(500).json({ 
      error: 'Failed to parse analysis from server.', 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Trinethra Backend Server running on http://localhost:${PORT}`);
});