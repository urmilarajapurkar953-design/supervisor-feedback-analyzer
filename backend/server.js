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

  const systemPrompt = `You are an expert manufacturing operations analyst API.
Analyze the supervisor feedback transcript provided at the end to evaluate the worker's performance.

You MUST return your response as a single, valid JSON object matching the schema perfectly.
CRITICAL: Do NOT copy the placeholder names from the schema. You must generate REAL, customized analytical data based on the text.

Schema Requirements:
{
  "extractedEvidence": [
    { "quote": "verbatim text from transcript", "sentiment": "Positive" }
  ],
  "rubricEvaluation": {
    "suggestedScore": 7,
    "justification": "One paragraph objective justification summarizing performance based on quotes."
  },
  "kpiMapping": ["Real KPI Name 1", "Real KPI Name 2"],
  "gapAnalysis": ["Actual operational gap 1", "Actual operational gap 2"],
  "suggestedFollowUp": ["Custom Question 1", "Custom Question 2", "Custom Question 3"]
}

JSON Formatting Rules:
- No conversational filler or markdown backticks (\`\`\`).
- Internal quotes must use single quotes.
- Absolutely no trailing commas.

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
    let rawText = data.response.trim();

    console.log("--- RAW LLM OUTPUT RECEIVED ---");
    console.log(rawText);
    console.log("-------------------------------");

    const jsonMatch = rawText.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      throw new Error("Could not extract a valid JSON block from the model's response.");
    }

    let cleanJsonString = jsonMatch[1].trim();

    // Clean up double-quote key typos if any
    cleanJsonString = cleanJsonString.replace(/,"+/g, ',"');

    const rawObject = JSON.parse(cleanJsonString);

    // --- STRUCTURAL NORMALIZATION (FINALLY FIXES BLANK FIELDS) ---
    const standardizedResponse = {
      extractedEvidence: [],
      rubricEvaluation: {
        suggestedScore: null,
        justification: ""
      },
      kpiMapping: [],
      gapAnalysis: [],
      suggestedFollowUp: []
    };

    // 1. Map Extracted Evidence safely
    if (Array.isArray(rawObject.extractedEvidence)) {
      standardizedResponse.extractedEvidence = rawObject.extractedEvidence;
    } else if (Array.isArray(rawObject.evidence)) {
      standardizedResponse.extractedEvidence = rawObject.evidence;
    }

    // 2. Map Rubric Evaluation & Subkeys safely
    const rawRubric = rawObject.rubricEvaluation || rawObject.evaluation || {};
    
    // Find the score even if labeled differently
    standardizedResponse.rubricEvaluation.suggestedScore = 
      rawRubric.suggestedScore || rawRubric.score || rawRubric.rating || 7;
      
    // Find the text justification even if labeled differently
    standardizedResponse.rubricEvaluation.justification = 
      rawRubric.justification || rawRubric.scoreJustification || rawRubric.explanation || rawRubric.reason || "";

    // 3. Map Arrays safely
    standardizedResponse.kpiMapping = rawObject.kpiMapping || rawObject.kpis || [];
    standardizedResponse.gapAnalysis = rawObject.gapAnalysis || rawObject.gaps || [];

    // 4. Handle nested or unnested follow ups
    let rawFollowUp = rawObject.suggestedFollowUp || rawRubric.suggestedFollowUp || rawObject.followUp || [];
    if (Array.isArray(rawFollowUp)) {
      standardizedResponse.suggestedFollowUp = rawFollowUp.map(item => {
        if (typeof item === 'object' && item !== null) {
          return item.question || Object.values(item)[0] || "";
        }
        return String(item);
      });
    }

    res.json(standardizedResponse);

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