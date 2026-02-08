
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

export const analyzeSheetData = async (rawData: string): Promise<AnalysisResult> => {
  // 함수 내부에서 초기화하여 API Key 주입 시점 문제를 해결합니다.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
      Analyze the church new family attendance data. 
      
      CRITICAL RULE - ATTENDANCE TRACKING:
      1. For each person, identify EXACTLY which "round" numbers (1 to 8) they have attended across all their records.
      2. Store these unique numbers in the 'attendedRounds' array.
      3. The 'attendanceCount' is the total number of unique rounds attended.

      CRITICAL RULE - COUPLE LINKING:
      1. If Person A has Person B as a spouse, they are a COUPLE.
      2. Share information between couples (Region, Notes).
      
      Categorization Logic (PRIORITY ORDER):
      1. 'placementTargets': 4 or more unique rounds attended AND NO "[배치완료]" tag in any notes.
      2. 'placedMembers': 4 or more unique rounds attended AND HAS "[배치완료]" tag in notes.
      3. 'completedMembers': 8 or more unique rounds total.
      4. 'ongoingMembers': Everyone else with < 4 unique rounds and NO "[배치완료]" tag.
      
      Raw CSV Data:
      ${rawData}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          placementTargets: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          placedMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          ongoingMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          completedMembers: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, spouseName: { type: Type.STRING, nullable: true }, attendanceCount: { type: Type.NUMBER }, attendedRounds: { type: Type.ARRAY, items: { type: Type.INTEGER } }, region: { type: Type.STRING }, details: { type: Type.STRING }, status: { type: Type.STRING } } } },
          totalAttendanceRecords: { type: Type.NUMBER }
        },
        required: ["placementTargets", "placedMembers", "ongoingMembers", "completedMembers", "totalAttendanceRecords"]
      }
    }
  });

  return JSON.parse(response.text.trim()) as AnalysisResult;
};
