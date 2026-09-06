import { describe, expect, it } from 'vitest';
import {
	createMemberIdentityLookup,
	formatMemberLabel
} from '$lib/features/members/lib/roster';

// 로스터 조회: 활동 로그(행위자)/보관함(올린 사람)이 id 를 사람으로 바꿀 때 쓰는 순수 모듈
// 이름은 조직 내 동명이인이 허용되므로(표시 이름) 이메일까지 함께 돌려주는 게 이 모듈의 계약이다.

const ROSTER = [
	{ id: 7, name: '김보섭', email: 'escoa@escoa.kr' },
	{ id: 9, name: '김보섭', email: 'other@escoa.kr' }, // 동명이인: 이메일로만 갈린다
	{ id: 11, name: '이메일없음' } // 로스터에 이메일이 없는 경우(옵셔널)
];

describe('createMemberIdentityLookup', () => {
	it('id 로 이름과 이메일을 함께 돌려준다', () => {
		const lookup = createMemberIdentityLookup(ROSTER);
		expect(lookup(7)).toEqual({ name: '김보섭', email: 'escoa@escoa.kr' });
	});

	it('동명이인을 이메일로 구분한다', () => {
		const lookup = createMemberIdentityLookup(ROSTER);
		expect(lookup(7).name).toBe(lookup(9).name);
		expect(lookup(7).email).not.toBe(lookup(9).email);
	});

	it('이메일이 없는 항목은 null 로 돌려준다', () => {
		const lookup = createMemberIdentityLookup(ROSTER);
		expect(lookup(11)).toEqual({ name: '이메일없음', email: null });
	});

	it('로스터에 없는 id 는 id 를 드러내는 문구로 폴백한다', () => {
		const lookup = createMemberIdentityLookup(ROSTER);
		expect(lookup(999)).toEqual({ name: '알 수 없는 사용자 (#999)', email: null });
	});
});

describe('formatMemberLabel', () => {
	it('이메일이 있으면 `이름 (이메일)` 로 적는다', () => {
		expect(formatMemberLabel({ name: '김보섭', email: 'escoa@escoa.kr' })).toBe(
			'김보섭 (escoa@escoa.kr)'
		);
	});

	it('로스터 항목(email?: string)을 그대로 넘길 수 있다. 호출부가 객체를 다시 짓지 않게', () => {
		expect(formatMemberLabel(ROSTER[0])).toBe('김보섭 (escoa@escoa.kr)');
		expect(formatMemberLabel(ROSTER[2])).toBe('이메일없음');
	});

	it('이메일이 없으면 이름만 적는다(폴백 문구도 그대로 읽힌다)', () => {
		expect(formatMemberLabel({ name: '이메일없음', email: null })).toBe('이메일없음');
		expect(formatMemberLabel({ name: '알 수 없는 사용자 (#999)', email: null })).toBe(
			'알 수 없는 사용자 (#999)'
		);
	});
});
