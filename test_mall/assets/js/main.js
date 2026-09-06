// ESCOA (test_mall) 발표용 목업 — 공통 스크립트
document.addEventListener('DOMContentLoaded', function () {

  // 모바일 햄버거 메뉴 토글
  var burger = document.querySelector('.hamburger');
  var mobileMenu = document.querySelector('.mobile-menu');
  if (burger && mobileMenu) {
    burger.addEventListener('click', function () {
      mobileMenu.classList.toggle('open');
    });
  }

  // 언어 선택 드롭다운 — 클릭하면 목록만 보여줌 (각 언어 항목은 클릭 동작 없음)
  var langBtn = document.querySelector('[data-lang-btn]');
  var langDropdown = document.querySelector('.lang-dropdown');
  if (langBtn && langDropdown) {
    langBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      langDropdown.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!langDropdown.contains(e.target) && e.target !== langBtn) {
        langDropdown.classList.remove('open');
      }
    });
  }

  // 히어로 배너 화살표(장식용, 실제 슬라이드 전환 없이 알림만)
  document.querySelectorAll('.hero-arrow').forEach(function (btn) {
    btn.addEventListener('click', function () {
      // 발표용 목업: 실제 캐러셀 로직은 연결하지 않음
      console.log('배너 이동(목업):', btn.classList.contains('prev') ? '이전' : '다음');
    });
  });

  // 결제하기 버튼 → 주문완료 오버레이 표시 (실제 결제 없음, 발표용)
  var payBtn = document.querySelector('[data-pay-btn]');
  var overlay = document.querySelector('.order-complete-overlay');
  if (payBtn && overlay) {
    payBtn.addEventListener('click', function (e) {
      e.preventDefault();
      overlay.classList.add('open');
    });
    overlay.querySelectorAll('[data-close-overlay]').forEach(function (el) {
      el.addEventListener('click', function () {
        overlay.classList.remove('open');
        window.location.href = 'index.html';
      });
    });
  }

  // 결제수단 선택 시 선택 스타일 표시
  document.querySelectorAll('.pay-method').forEach(function (label) {
    var input = label.querySelector('input');
    if (!input) return;
    input.addEventListener('change', function () {
      document.querySelectorAll('.pay-method').forEach(function (l) { l.classList.remove('selected'); });
      if (input.checked) label.classList.add('selected');
    });
  });

  // 상품 필터 pill(전체/First100/Bon/Petit/Grand) 클릭 시 활성 표시만 (실제 필터링 없음)
  document.querySelectorAll('.pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
    });
  });

  // 관리자 - 노출 여부 토글
  document.querySelectorAll('.admin-toggle .switch').forEach(function (sw) {
    sw.addEventListener('click', function () {
      sw.style.background = sw.style.background === 'rgb(148, 139, 124)' ? '' : '#948b7c';
    });
  });

});
