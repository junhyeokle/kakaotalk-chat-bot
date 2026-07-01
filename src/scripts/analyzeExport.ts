import * as fs from 'fs';
import * as path from 'path';
import { parseKakaoExport } from './lib/parseKakaoExport';
import { analyzeRoomExport } from '../persona/exportAnalyzer';
import { saveRoomProfile } from '../firebase/roomProfileStore';
import { getLlmProvider } from '../llm';

const DEFAULT_SAMPLE_SIZE = 800;

/**
 * One-shot CLI: analyze a KakaoTalk "export chat" .txt file with the LLM and
 * save the result as a named room profile, ready to be linked to a real room
 * later via "npm run link-profile".
 * Usage: npm run analyze-export -- <내보내기.txt 경로> <profileId> [샘플개수]
 */
async function main(): Promise<void> {
  const [filePath, profileId, sampleSizeRaw] = process.argv.slice(2);

  if (!filePath || !profileId) {
    console.error('Usage: npm run analyze-export -- <내보내기.txt 경로> <profileId> [샘플개수]');
    process.exit(1);
  }

  const sampleSize = sampleSizeRaw ? Number(sampleSizeRaw) : DEFAULT_SAMPLE_SIZE;
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    console.error('샘플 개수는 양의 정수여야 합니다.');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const allMessages = parseKakaoExport(raw);

  if (allMessages.length === 0) {
    console.error(
      '메시지를 하나도 파싱하지 못했습니다. 내보내기 파일 형식을 확인해주세요 ' +
        '(src/scripts/lib/parseKakaoExport.ts의 MESSAGE_PATTERN 참고).',
    );
    process.exit(1);
  }

  const sample = allMessages.slice(-sampleSize);
  console.log(`총 ${allMessages.length}개 메시지 중 최근 ${sample.length}개를 분석합니다...`);

  const analysis = await analyzeRoomExport(getLlmProvider(), profileId, sample);

  await saveRoomProfile(profileId, {
    sourceLabel: profileId,
    ...analysis,
    analyzedAt: Date.now(),
  });

  console.log(`\n분석 완료. roomProfiles/${profileId} 에 저장됨.\n`);
  console.log(`분위기: ${analysis.vibe}`);
  console.log(`대화 수위: ${analysis.contentRating}`);
  console.log(`주요 화제: ${analysis.topics.join(', ')}`);
  console.log(`\n생성된 페르소나:\n${analysis.personaSuggestion}`);
  console.log('\n실제 방에 연결하려면 "npm run list-channels"로 chatId를 찾은 뒤:');
  console.log(`  npm run link-profile -- <chatId> ${profileId}`);
}

main().catch((err) => {
  console.error('분석 실패:', err instanceof Error ? err.message : err);
  process.exit(1);
});
