
export const fetchSheetData = async (sheetUrl: string): Promise<string> => {
  try {
    const matches = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!matches || !matches[1]) {
      throw new Error("유효한 구글 시트 URL이 아닙니다.");
    }
    const sheetId = matches[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&cachebust=${Date.now()}`;
    
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error("시트 데이터를 가져오지 못했습니다. 시트가 '링크가 있는 모든 사용자에게 공개' 상태인지 확인해주세요.");
    }
    
    return await response.text();
  } catch (error) {
    console.error("Sheet Fetch Error:", error);
    throw error;
  }
};

/**
 * Appends data to a Google Sheet via a Google Apps Script Web App URL.
 */
export const appendEntriesToSheet = async (entries: any[], scriptUrl: string): Promise<void> => {
  if (!scriptUrl || !scriptUrl.startsWith('http')) {
    throw new Error("유효한 Apps Script URL이 설정되지 않았습니다. 관리자 설정에서 URL을 입력해주세요.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

  try {
    // text/plain content type is used to avoid CORS preflight issues with Google Apps Script
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors', 
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(entries),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("전송 시간이 초과되었습니다. 네트워크 상태나 Apps Script URL을 확인해주세요.");
    }
    console.error("Sheet Update Error:", error);
    throw new Error("시트 업데이트 중 오류가 발생했습니다: " + error.message);
  }
};
