/* EV CC — Volvo EX30 51 kWh charging-curve model */

const vehicles = {
    ex30: { name: "Volvo EX30", batteryCapacity: 51 }
};

// Approximate EVKX points. The same interpolated curve drives the calculation and chart.
const ex30ChargingCurve = [
    { soc: 10, power: 146 }, { soc: 15, power: 148 },
    { soc: 20, power: 145 }, { soc: 25, power: 138 },
    { soc: 30, power: 135 }, { soc: 35, power: 128 },
    { soc: 40, power: 118 }, { soc: 45, power: 104 },
    { soc: 50, power: 102 }, { soc: 55, power: 91 },
    { soc: 60, power: 80 }, { soc: 65, power: 72 },
    { soc: 70, power: 63 }, { soc: 75, power: 54 },
    { soc: 80, power: 37 }, { soc: 85, power: 31 },
    { soc: 90, power: 14 }, { soc: 95, power: 14 }, { soc: 100, power: 14 }
];

let currentMode = "time";

function selectVehicle() {
    const vehicle = vehicles[document.getElementById("vehicle").value];
    if (vehicle) document.getElementById("batteryCapacity").value = vehicle.batteryCapacity;
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById("timeMode").classList.toggle("hidden", mode !== "time");
    document.getElementById("socMode").classList.toggle("hidden", mode !== "soc");
    document.getElementById("timeModeButton").classList.toggle("active", mode === "time");
    document.getElementById("socModeButton").classList.toggle("active", mode === "soc");
}

function validateInputs(batteryCapacity, currentSOC, chargingPower) {
    if (!Number.isFinite(batteryCapacity) || batteryCapacity <= 0) return "バッテリー容量を入力してください。";
    if (!Number.isFinite(currentSOC) || currentSOC < 0 || currentSOC >= 100) return "現在の充電率は0〜99.9%で入力してください。";
    if (!Number.isFinite(chargingPower) || chargingPower <= 0) return "充電器の出力を入力してください。";
    return null;
}

function getChargingPower(soc) {
    if (soc <= ex30ChargingCurve[0].soc) return ex30ChargingCurve[0].power;
    const last = ex30ChargingCurve.at(-1);
    if (soc >= last.soc) return last.power;

    for (let i = 0; i < ex30ChargingCurve.length - 1; i++) {
        const lower = ex30ChargingCurve[i];
        const upper = ex30ChargingCurve[i + 1];
        if (soc >= lower.soc && soc <= upper.soc) {
            const ratio = (soc - lower.soc) / (upper.soc - lower.soc);
            return lower.power + (upper.power - lower.power) * ratio;
        }
    }
    return last.power;
}

function getEffectiveChargingPower(soc, chargerPower) {
    return Math.min(getChargingPower(soc), chargerPower);
}

// Each segment uses the arithmetic mean of its start/end effective power.
function calculateChargingTime(startSOC, targetSOC, batteryCapacity, chargerPower) {
    let totalMinutes = 0;
    let segmentStart = startSOC;
    while (segmentStart < targetSOC - 1e-9) {
        const segmentEnd = Math.min(Math.floor(segmentStart) + 1, targetSOC);
        const startPower = getEffectiveChargingPower(segmentStart, chargerPower);
        const endPower = getEffectiveChargingPower(segmentEnd, chargerPower);
        const averagePower = (startPower + endPower) / 2;
        const energy = batteryCapacity * (segmentEnd - segmentStart) / 100;
        totalMinutes += energy / averagePower * 60;
        segmentStart = segmentEnd;
    }
    return totalMinutes;
}

function calculateTargetSOC(startSOC, availableMinutes, batteryCapacity, chargerPower) {
    let soc = startSOC;
    let remainingMinutes = availableMinutes;
    while (soc < 100 - 1e-9 && remainingMinutes > 0) {
        const segmentEnd = Math.min(Math.floor(soc) + 1, 100);
        const segmentMinutes = calculateChargingTime(soc, segmentEnd, batteryCapacity, chargerPower);
        if (remainingMinutes >= segmentMinutes) {
            remainingMinutes -= segmentMinutes;
            soc = segmentEnd;
        } else {
            // Find the partial-SOC endpoint with the same average-power rule.
            let low = soc;
            let high = segmentEnd;
            for (let i = 0; i < 28; i++) {
                const middle = (low + high) / 2;
                if (calculateChargingTime(soc, middle, batteryCapacity, chargerPower) < remainingMinutes) {
                    low = middle;
                } else {
                    high = middle;
                }
            }
            soc = (low + high) / 2;
            remainingMinutes = 0;
        }
    }
    return Math.min(soc, 100);
}

function calculateEnergy(batteryCapacity, startSOC, targetSOC) {
    return batteryCapacity * (targetSOC - startSOC) / 100;
}

function getCompletionTime(minutes) {
    const completion = new Date(Date.now() + minutes * 60 * 1000);
    return `${String(completion.getHours()).padStart(2, "0")}:${String(completion.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(minutes) {
    let totalSeconds = Math.round(minutes * 60);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins} min ${secs} sec`;
}

function showError(message) {
    document.getElementById("result").innerHTML = `<div class="result-card"><div class="result-title">ERROR</div><div class="result-error">${message}</div></div>`;
}

function renderResult(startSOC, targetSOC, durationMinutes, energy, chargerPower) {
    const result = document.getElementById("result");
    result.innerHTML = `
        <div class="result-card">
            <div class="result-title">RESULT</div>
            <div class="result-soc">${startSOC.toFixed(1)}% → ${targetSOC.toFixed(1)}%</div>
            <div class="result-label">EXPECTED COMPLETION</div>
            <div class="result-completion">${getCompletionTime(durationMinutes)}</div>
            <div class="result-info"><div>${formatDuration(durationMinutes)}</div><div>+${energy.toFixed(1)} kWh</div></div>
            <div class="curve-section">
                <div class="curve-heading"><div class="curve-caption">CHARGING CURVE</div><div class="curve-note">0–100% SOC / kW</div></div>
                <canvas id="chargingCurveChart" class="curve-canvas" role="img" aria-label="充電カーブ。${startSOC.toFixed(1)}%から${targetSOC.toFixed(1)}%までの区間を強調表示。"></canvas>
                <div class="curve-legend"><span class="curve-swatch"></span>今回の充電区間（充電器上限 ${chargerPower} kW を反映）</div>
            </div>
        </div>`;
    requestAnimationFrame(() => drawChargingCurve(startSOC, targetSOC, chargerPower));
}

function drawChargingCurve(startSOC, targetSOC, chargerPower) {
    const canvas = document.getElementById("chargingCurveChart");
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const cssWidth = Math.max(canvas.clientWidth, 280);
    const cssHeight = Math.round(cssWidth * 0.56);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const padding = { top: 22, right: 16, bottom: 32, left: 38 };
    const width = cssWidth - padding.left - padding.right;
    const height = cssHeight - padding.top - padding.bottom;
    const points = Array.from({ length: 101 }, (_, soc) => ({ soc, power: getEffectiveChargingPower(soc, chargerPower) }));
    const maxPower = Math.max(160, Math.ceil(Math.max(...points.map(point => point.power)) / 20) * 20);
    const x = soc => padding.left + width * soc / 100;
    const y = power => padding.top + height * (1 - power / maxPower);

    context.clearRect(0, 0, cssWidth, cssHeight);
    context.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillStyle = "#77766f";
    context.strokeStyle = "#e5e3dd";
    context.lineWidth = 1;

    [0, maxPower / 2, maxPower].forEach(power => {
        const py = y(power);
        context.beginPath(); context.moveTo(padding.left, py); context.lineTo(cssWidth - padding.right, py); context.stroke();
        context.fillText(`${power}`, 4, py + 4);
    });
    [0, 25, 50, 75, 100].forEach(soc => {
        const px = x(soc);
        context.fillText(`${soc}%`, px - (soc === 100 ? 20 : 8), cssHeight - 10);
    });
    context.fillText("kW", 4, 13);

    // Highlighted area beneath the selected part of the shared curve.
    const highlighted = points.filter(point => point.soc >= Math.floor(startSOC) && point.soc <= Math.ceil(targetSOC));
    const startPoint = { soc: startSOC, power: getEffectiveChargingPower(startSOC, chargerPower) };
    const endPoint = { soc: targetSOC, power: getEffectiveChargingPower(targetSOC, chargerPower) };
    const selectedPoints = [startPoint, ...highlighted.filter(point => point.soc > startSOC && point.soc < targetSOC), endPoint];
    context.beginPath();
    context.moveTo(x(startPoint.soc), y(0));
    selectedPoints.forEach(point => context.lineTo(x(point.soc), y(point.power)));
    context.lineTo(x(endPoint.soc), y(0));
    context.closePath();
    context.fillStyle = "rgba(49, 92, 77, .13)";
    context.fill();

    const drawLine = (linePoints, color, lineWidth) => {
        context.beginPath();
        linePoints.forEach((point, index) => index ? context.lineTo(x(point.soc), y(point.power)) : context.moveTo(x(point.soc), y(point.power)));
        context.strokeStyle = color; context.lineWidth = lineWidth; context.lineJoin = "round"; context.lineCap = "round"; context.stroke();
    };
    drawLine(points, "#b8bbb4", 2);
    drawLine(selectedPoints, "#315c4d", 3.5);

    [startPoint, endPoint].forEach(point => {
        context.beginPath(); context.arc(x(point.soc), y(point.power), 4.5, 0, Math.PI * 2);
        context.fillStyle = "#fff"; context.fill(); context.lineWidth = 2.5; context.strokeStyle = "#315c4d"; context.stroke();
    });
}

function calculate() {
    const batteryCapacity = Number(document.getElementById("batteryCapacity").value);
    const currentSOC = Number(document.getElementById("currentSOC").value);
    const chargingPower = Number(document.getElementById("chargingPower").value);
    const error = validateInputs(batteryCapacity, currentSOC, chargingPower);
    if (error) return showError(error);

    if (currentMode === "time") {
        const chargingTime = Number(document.getElementById("chargingTime").value);
        if (!Number.isFinite(chargingTime) || chargingTime <= 0) return showError("充電時間を入力してください。");
        const targetSOC = calculateTargetSOC(currentSOC, chargingTime, batteryCapacity, chargingPower);
        const actualDuration = calculateChargingTime(currentSOC, targetSOC, batteryCapacity, chargingPower);
        renderResult(currentSOC, targetSOC, actualDuration, calculateEnergy(batteryCapacity, currentSOC, targetSOC), chargingPower);
        return;
    }

    const targetSOC = Number(document.getElementById("targetSOC").value);
    if (!Number.isFinite(targetSOC) || targetSOC <= currentSOC || targetSOC > 100) return showError("目標の充電率は、現在の充電率より高く100%以下で入力してください。");
    const duration = calculateChargingTime(currentSOC, targetSOC, batteryCapacity, chargingPower);
    renderResult(currentSOC, targetSOC, duration, calculateEnergy(batteryCapacity, currentSOC, targetSOC), chargingPower);
}

window.addEventListener("resize", () => {
    const canvas = document.getElementById("chargingCurveChart");
    if (!canvas) return;
    const [start, end] = document.querySelector(".result-soc").textContent.match(/[\d.]+/g).map(Number);
    drawChargingCurve(start, end, Number(document.getElementById("chargingPower").value));
});
