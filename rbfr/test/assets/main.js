// RBFR 연구 — 디자인 예시 스크립트 (실제 계산 로직 아님, 상호작용 데모용)

document.addEventListener('DOMContentLoaded', function () {

  /* ===================== 탭 전환 ===================== */
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.panel');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  /* ===================== 오각형 차트 공통 유틸 ===================== */
  var CX = 160, CY = 160, R = 130;
  var AXES = 5;

  function axisPoint(index, valuePercent) {
    var angle = (-90 + index * (360 / AXES)) * Math.PI / 180;
    var radius = (valuePercent / 100) * R;
    return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
  }

  function pointsToString(pts) {
    return pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  }

  function drawStaticGrid(svg) {
    // 링(등고선)
    svg.querySelectorAll('.grid-ring').forEach(function (ring) {
      var frac = parseFloat(ring.dataset.ring);
      var pts = [];
      for (var i = 0; i < AXES; i++) pts.push(axisPoint(i, frac * 100));
      ring.setAttribute('points', pointsToString(pts));
    });
    // 축선
    svg.querySelectorAll('.grid-axis').forEach(function (line) {
      var i = parseInt(line.dataset.axis, 10);
      var p = axisPoint(i, 100);
      line.setAttribute('x1', CX); line.setAttribute('y1', CY);
      line.setAttribute('x2', p.x); line.setAttribute('y2', p.y);
    });
  }

  /**
   * 스프링형 애니메이션 컨트롤러
   * current: 화면에 실제로 그려지는 값(0~100) 5개
   * target: 목표값 5개 — 바뀔 때마다 여기로 자연스럽게 수렴
   */
  function createPentagonAnimator(svg, initial) {
    var current = initial.slice();
    var target = initial.slice();
    var running = false;
    var shape = svg.querySelector('.data-shape');
    var dots = svg.querySelectorAll('.data-dot');

    function render() {
      var pts = [];
      for (var i = 0; i < AXES; i++) pts.push(axisPoint(i, current[i]));
      shape.setAttribute('points', pointsToString(pts));
      dots.forEach(function (dot, i) {
        dot.setAttribute('cx', pts[i].x.toFixed(1));
        dot.setAttribute('cy', pts[i].y.toFixed(1));
      });
    }

    function tick() {
      var stillMoving = false;
      for (var i = 0; i < AXES; i++) {
        var diff = target[i] - current[i];
        if (Math.abs(diff) > 0.05) {
          current[i] += diff * 0.16; // 스프링 계수 — 값이 클수록 빠르게 수렴
          stillMoving = true;
        } else {
          current[i] = target[i];
        }
      }
      render();
      if (stillMoving) {
        requestAnimationFrame(tick);
      } else {
        running = false;
      }
    }

    render();

    return {
      setTarget: function (newTarget, onEachAxis) {
        target = newTarget.slice();
        if (onEachAxis) onEachAxis(target);
        if (!running) { running = true; requestAnimationFrame(tick); }
      }
    };
  }

  /* ===================== 탭1: 정방향 계산 ===================== */
  var fwdSvg = document.getElementById('fwd-chart');
  drawStaticGrid(fwdSvg);
  // 5번째 값(균형/통합역할)은 원료 기여도로 계산하지 않는다 — 별도 근거가 있을 때만 채워진다(아래 balanceState).
  var fwdAnimator = createPentagonAnimator(fwdSvg, [78, 52, 88, 71, 0]);

  // 원료별 직접역할 4개 기여도(보습/진정/보호/정돈) — 데모용 가상값. 균형(통합역할)은 원료 단위 값이 없다(05번 원칙5).
  var AXES_DIRECT = 4;
  var INGREDIENT_VECTORS = [
    [90, 70, 60, 40], // 유기농 녹차수
    [50, 85, 40, 55], // 무환자추출물
    [70, 40, 50, 90], // 병풀 엑소좀
    [55, 45, 95, 60], // 호호바 오일
    [60, 30, 40, 50]  // 세라마이드3 — 확정 데이터 없음(NODATA), AI 추론 토글 ON일 때만 PROPOSED로 계산에 포함
  ];

  // 균형(통합역할) 상태 — 근거가 없으면 계속 미입력, 데모 버튼으로만 채워진다.
  var balanceState = { hasEvidence: false, value: 0 };

  var fwdValueLabels = document.querySelectorAll('#fwd-values b:not(.pending)');
  var fwdRatioLabels = document.querySelectorAll('#fwd-values .ratio-pct');
  var balanceValueEl = document.getElementById('balance-value');
  var balancePendingBadge = document.getElementById('balance-pending-badge');
  var balanceAxisValueEl = document.getElementById('balance-axis-value');
  var balanceEvidenceBtn = document.getElementById('balance-add-evidence-btn');

  if (balanceEvidenceBtn) {
    balanceEvidenceBtn.addEventListener('click', function () {
      balanceState.hasEvidence = !balanceState.hasEvidence;
      balanceState.value = balanceState.hasEvidence ? 65 : 0;
      if (balanceState.hasEvidence) {
        balanceValueEl.textContent = balanceState.value;
        balanceValueEl.classList.remove('pending');
        balancePendingBadge.textContent = '근거 있음(데모)';
        balanceAxisValueEl.classList.add('has-evidence');
        balanceEvidenceBtn.textContent = '근거 삭제(데모)';
      } else {
        balanceValueEl.textContent = '미입력';
        balanceValueEl.classList.add('pending');
        balancePendingBadge.textContent = '근거 없음';
        balanceAxisValueEl.classList.remove('has-evidence');
        balanceEvidenceBtn.textContent = '근거 입력(데모)';
      }
      recomputeForward();
    });
  }

  /* AI 추론 데이터 토글 (05_스코어링엔진.md "AI 추론 데이터 폴백") */
  var aiToggle = document.getElementById('ai-infer-toggle');
  var aiRow = document.getElementById('ai-ingredient-row');
  var aiBadge = document.getElementById('ai-ingredient-badge');
  var aiSlider = document.getElementById('ai-ingredient-slider');

  aiToggle.addEventListener('change', function () {
    if (aiToggle.checked) {
      aiRow.dataset.disabled = 'false';
      aiSlider.disabled = false;
      aiSlider.value = 15;
      aiBadge.textContent = 'AI 추론 데이터';
      aiBadge.classList.remove('grade-nodata');
      aiBadge.classList.add('grade-ai');
    } else {
      aiRow.dataset.disabled = 'true';
      aiSlider.disabled = true;
      aiSlider.value = 0;
      aiBadge.textContent = '데이터 없음';
      aiBadge.classList.remove('grade-ai');
      aiBadge.classList.add('grade-nodata');
    }
    recomputeForward();
  });

  function recomputeForward() {
    var sliders = document.querySelectorAll('#panel-forward .ratio-slider');
    var ratios = [];
    var total = 0;
    sliders.forEach(function (s, i) {
      var v = parseFloat(s.value);
      ratios.push(v);
      total += v;
      s.parentElement.querySelector('.ratio-value').textContent = v + '%';
    });

    document.getElementById('fwd-total-badge').textContent = '합계 ' + total + '%';
    var badge = document.getElementById('fwd-total-badge');
    badge.classList.toggle('ok', total <= 100);

    // 가산 방식으로 직접역할 4개만 계산 (05_스코어링엔진.md 수정본 — 비율로 나눠 평균내지 않는다)
    // 원료를 추가해도 기존 원료의 기여분은 줄지 않고, 새 원료의 기여분이 그 위에 더해질 뿐이다.
    var directResult = [0, 0, 0, 0];
    ratios.forEach(function (r, i) {
      var vec = INGREDIENT_VECTORS[i] || [50, 50, 50, 50];
      for (var a = 0; a < AXES_DIRECT; a++) directResult[a] += (r / 100) * vec[a];
    });
    // 방어적 캡: 배합비율 합계가 100%를 넘지 않는 한 이론상 필요 없지만 안전하게 clamp
    directResult = directResult.map(function (v) { return Math.min(100, v); });

    // 균형(통합역할)은 위 계산과 무관하게 balanceState에서만 값을 받는다(근거 없으면 0=미입력 취급).
    var axisResult = directResult.concat([balanceState.value]);

    fwdAnimator.setTarget(axisResult, function (t) {
      fwdValueLabels.forEach(function (el, i) { el.textContent = Math.round(t[i]); });
      // 비중값은 근거가 있을 때만 균형을 합계에 포함한다. 근거 없는 균형을 분모에 넣으면
      // "남는 비중으로 균형을 채우는 것"과 실질적으로 같아져 05번 원칙5를 어기게 된다.
      var directSum = t.slice(0, AXES_DIRECT).reduce(function (a, b) { return a + b; }, 0) || 1;
      fwdRatioLabels.forEach(function (el, i) { el.textContent = Math.round((t[i] / directSum) * 100) + '%'; });
      renderCellStrip(t);
    });
  }

  /**
   * Cell(칸) 공식 표현 — 데모용 변환표. 실제 값은 rbfr_cell_mapping(rule_version)에서
   * 읽어야 하며(05_스코어링엔진.md "Cell·오각형"), 여기서는 그 존재를 보여주기 위한 고정 임계값만 쓴다.
   */
  var CELL_THRESHOLDS = [95, 80, 60, 40, 20]; // 이 값 이상이면 각각 5/4/3/2/1칸
  function ratioToCellCount(value) {
    for (var i = 0; i < CELL_THRESHOLDS.length; i++) {
      if (value >= CELL_THRESHOLDS[i]) return CELL_THRESHOLDS.length - i;
    }
    return 0;
  }

  var cellTotalBadge = document.getElementById('cell-total-badge');
  var cellRowEls = document.querySelectorAll('#cell-rows .cell-row');
  function renderCellStrip(axisValues) {
    var total = 0;
    cellRowEls.forEach(function (row) {
      var idx = parseInt(row.dataset.cellRole, 10);
      var isIntegrated = idx === 4;
      var count = (isIntegrated && !balanceState.hasEvidence) ? 0 : ratioToCellCount(axisValues[idx] || 0);
      total += count;
      var existingDots = row.querySelectorAll('.cell-dot');
      existingDots.forEach(function (d) { d.remove(); });
      for (var c = 0; c < 5; c++) {
        var dot = document.createElement('span');
        dot.className = 'cell-dot' + (c < count ? ' filled' : '');
        row.appendChild(dot);
      }
    });
    cellTotalBadge.textContent = '총 ' + total + ' / 15~18';
    cellTotalBadge.classList.toggle('ok', total >= 15 && total <= 18);
  }

  document.querySelectorAll('#panel-forward .ratio-slider').forEach(function (s) {
    s.addEventListener('input', recomputeForward);
  });
  recomputeForward();

  /* ===================== 탭2: 역방향 추천 (목표 오각형) ===================== */
  var revSvg = document.getElementById('rev-chart');
  drawStaticGrid(revSvg);
  var revAnimator = createPentagonAnimator(revSvg, [85, 60, 90, 70, 75]);

  document.querySelectorAll('#panel-reverse [data-rev-axis]').forEach(function (slider) {
    slider.addEventListener('input', function () {
      var idx = parseInt(slider.dataset.revAxis, 10);
      slider.parentElement.querySelector('.slider-num').textContent = slider.value;

      var target = [];
      document.querySelectorAll('#panel-reverse [data-rev-axis]').forEach(function (s) {
        target.push(parseFloat(s.value));
      });
      revAnimator.setTarget(target);
    });
  });

  /* ===================== 탭3: 원료 등록 - 직접역할 4개 기여도(독립 0~100, 합계 제약 없음) ===================== */
  // 03_DB스키마.md rbfr_ingredient_roles.contribution: 역할마다 독립적으로 0~100. 이전 버전의
  // "5축 합계 10" 제약은 실제 스펙에 없는 잘못된 가정이었다(정정).
  var stepValues = [62, 40, 55, 30];
  var stepEls = document.querySelectorAll('#panel-register .stepper-val');

  function renderSteppers() {
    stepEls.forEach(function (el, i) {
      el.textContent = stepValues[i];
    });
  }

  document.querySelectorAll('#panel-register .stepper-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('.stepper-row');
      var valEl = row.querySelector('.stepper-val');
      var idx = parseInt(valEl.dataset.axis, 10);
      var delta = parseFloat(btn.dataset.step) * 5;
      stepValues[idx] = Math.min(100, Math.max(0, stepValues[idx] + delta));
      renderSteppers();
    });
  });
  renderSteppers();

  /* ===================== 탭1: 처방으로 저장 (추가) ===================== */
  var saveBtn = document.getElementById('save-formula-btn');
  var saveForm = document.getElementById('save-formula-form');
  var confirmBtn = document.getElementById('confirm-save-formula');
  var confirmMsg = document.getElementById('save-confirm-msg');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      saveForm.hidden = !saveForm.hidden;
    });
  }
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function () {
      confirmMsg.hidden = false;
    });
  }

  /* MFDS 조회 버튼(데모: 클릭 시 살짝 강조만) */
  document.querySelectorAll('.btn-solid').forEach(function (btn) {
    if (btn.textContent.indexOf('식약청 조회') !== -1) {
      btn.addEventListener('click', function () {
        var result = document.querySelector('.mfds-result');
        result.style.transition = 'background 0.3s';
        result.style.background = '#e0edfa';
        setTimeout(function () { result.style.background = ''; }, 400);
      });
    }
  });
});
