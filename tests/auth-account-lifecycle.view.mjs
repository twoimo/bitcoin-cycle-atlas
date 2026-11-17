const status = { 0: "없음", 1: "대기", 2: "회원", 3: "관리자", 4: "거절", 5: "탈퇴" };

export function state(vars) {
  const who = vars.session === 0 ? "로그아웃" : vars.session === 1 ? "A 세션" : vars.session === 3 ? "C 세션" : "B 세션";
  const flight = vars.inflight ? " · 로그인 확인 중" : "";
  const replacement = vars.c === 3 ? " · C 관리자" : "";
  return `A ${status[vars.a] ?? vars.a} · B ${status[vars.b] ?? vars.b} · ${who}${replacement}${flight}`;
}

export function group(vars) {
  if (vars.aBuried && vars.a !== 5) return "탈퇴 복구";
  return vars.session === 0 ? "로그아웃" : "로그인";
}

export const colors = { 로그아웃: "blue", 로그인: "teal", "탈퇴 복구": "orange" };

export const title = "계정 수명";
