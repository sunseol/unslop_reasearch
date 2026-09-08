// 병렬 트랙 brief(review_status: pending)를 사람이 검토·승인·반려하는 도구.
// 사용:
//   node scripts/review-briefs.mjs --list                 # pending 과제 목록
//   node scripts/review-briefs.mjs --show task-101        # brief 전문과 원천 문서 앞부분
//   node scripts/review-briefs.mjs --approve task-101,task-102 --by 검토자이름
//   node scripts/review-briefs.mjs --reject task-103 --by 검토자이름 --reason "원문 표현이 사실 목록에 그대로 들어감"
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TASKS = 'data/tasks.jsonl';
const DOCS = 'data/documents.jsonl';

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--list') args.list = true;
    else if (a === '--show') args.show = argv[++i];
    else if (a === '--approve') args.approve = argv[++i].split(',');
    else if (a === '--reject') args.reject = argv[++i].split(',');
    else if (a === '--by') args.by = argv[++i];
    else if (a === '--reason') args.reason = argv[++i];
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tasks = readJsonl(TASKS);
  const parallel = tasks.filter((t) => t.track === 'parallel');

  if (args.list) {
    console.log('ID | 상태 | 영역 | 사실 수 | 독자 추정 | 원천 | 제목');
    for (const t of parallel) {
      console.log(`${t.id} | ${t.review_status} | ${t.domain} | ${t.facts.length} | ${t.reader_inferred ? '추정' : '명시'} | ${t.derived_from} | ${t.title}`);
    }
    return;
  }

  if (args.show) {
    const t = parallel.find((x) => x.id === args.show);
    if (!t) throw new Error(`없는 과제: ${args.show}`);
    const doc = readJsonl(DOCS).find((d) => d.id === t.derived_from);
    console.log(`=== ${t.id} (${t.review_status}) ← ${t.derived_from}\n`);
    console.log(t.brief);
    console.log('\n=== 원천 문서 앞부분\n');
    console.log(doc ? doc.text.slice(0, 1200) : '(documents.jsonl에 없음)');
    return;
  }

  const ids = args.approve ?? args.reject;
  if (!ids) throw new Error('--list, --show, --approve, --reject 중 하나가 필요하다');
  if (!args.by) throw new Error('--by 검토자 이름이 필요하다');
  const targets = ids[0] === 'all' ? parallel.filter((t) => t.review_status === 'pending').map((t) => t.id) : ids;
  const status = args.approve ? 'approved' : 'rejected';
  let n = 0;
  for (const t of tasks) {
    if (!targets.includes(t.id)) continue;
    if (t.track !== 'parallel') throw new Error(`${t.id}는 병렬 트랙 과제가 아니다`);
    t.review_status = status;
    t.review = { by: args.by, at: new Date().toISOString(), reason: args.reason ?? null };
    n += 1;
  }
  writeFileSync(TASKS, `${tasks.map((t) => JSON.stringify(t)).join('\n')}\n`);
  console.log(`${status}: ${n}건`);
}

main();
