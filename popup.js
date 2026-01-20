const operationSelect = document.getElementById("operation");
const valueSection = document.getElementById("valueSection");
const valueLabel = document.getElementById("valueLabel");
const valueInput = document.getElementById("valueInput");
const valueHint = document.getElementById("valueHint");
const roundMode = document.getElementById("roundMode");
const applyBtn = document.getElementById("applyBtn");
const statusText = document.getElementById("statusText");

const operationConfig = {
  multiplier: {
    label: "输入倍数",
    hint: "倍数大于 0",
    step: "0.01",
    placeholder: "例如 1.05",
  },
  delta: {
    label: "输入加减数",
    hint: "可为负数，例如 -2",
    step: "0.01",
    placeholder: "例如 3.5",
  },
  integer: {
    label: "输入基础值",
    hint: "可留空，仅执行取整",
    step: "1",
    placeholder: "例如 1",
  },
};

const updateUiForOperation = () => {
  const config = operationConfig[operationSelect.value];
  valueLabel.textContent = config.label;
  valueHint.textContent = config.hint;
  valueInput.step = config.step;
  valueInput.placeholder = config.placeholder;
  valueSection.style.display = config ? "block" : "none";
};

const setStatus = (message, isError = false) => {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
};

const normalizeInputValue = (value) => {
  if (value === "" || value === null || Number.isNaN(value)) {
    return null;
  }
  return Number(value);
};

const executeScript = async () => {
  setStatus("");
  const value = normalizeInputValue(valueInput.value.trim());
  const operation = operationSelect.value;
  const rounding = roundMode.value;

  if (operation !== "integer" && value === null) {
    setStatus("请输入有效数值。", true);
    return;
  }

  if (operation === "multiplier" && value !== null && value <= 0) {
    setStatus("倍数必须大于 0。", true);
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      setStatus("未找到当前标签页。", true);
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (payload) => {
        const {
          operation: innerOperation,
          value: innerValue,
          rounding: innerRounding,
        } = payload;

        const applyRounding = (number) => {
          if (innerRounding === "ceil") {
            return Math.ceil(number);
          }
          if (innerRounding === "floor") {
            return Math.floor(number);
          }
          return Math.round(number);
        };

        const sanitizeNumber = (text) => {
          const cleaned = text.replace(/[^\d.-]/g, "");
          const parsed = Number(cleaned);
          return Number.isNaN(parsed) ? null : parsed;
        };

        const findHeaderText = (input) => {
          const cell = input.closest("td, th");
          if (!cell) {
            return "";
          }
          const row = cell.parentElement;
          const table = cell.closest("table");
          if (!row || !table) {
            return "";
          }
          const headerRow =
            table.querySelector("thead tr") || table.querySelector("tr");
          if (!headerRow || headerRow.children.length <= cell.cellIndex) {
            return "";
          }
          const headerCell = headerRow.children[cell.cellIndex];
          return headerCell?.textContent?.trim() || "";
        };

        const isPriceInput = (input) => {
          const type = (input.getAttribute("type") || "text").toLowerCase();
          if (type !== "text" && type !== "number") {
            return false;
          }
          if (input.disabled || input.readOnly) {
            return false;
          }
          const placeholder = input.getAttribute("placeholder") || "";
          const name = input.getAttribute("name") || "";
          const aria = input.getAttribute("aria-label") || "";
          const headerText = findHeaderText(input);
          const label = `${placeholder} ${name} ${aria} ${headerText}`.toLowerCase();
          return label.includes("价") || label.includes("price");
        };

        const inputs = Array.from(document.querySelectorAll("input")).filter(
          isPriceInput
        );

        let updatedCount = 0;

        inputs.forEach((input) => {
          const rawValue = input.value ?? "";
          const currentNumber = sanitizeNumber(rawValue);
          if (currentNumber === null) {
            return;
          }

          let nextValue = currentNumber;
          if (innerOperation === "multiplier") {
            nextValue = currentNumber * innerValue;
          } else if (innerOperation === "delta") {
            nextValue = currentNumber + innerValue;
          } else if (innerOperation === "integer") {
            if (innerValue !== null) {
              nextValue = currentNumber * innerValue;
            }
            nextValue = applyRounding(nextValue);
          }

          const finalValue =
            innerOperation === "integer"
              ? String(nextValue)
              : nextValue.toFixed(2);

          input.value = finalValue;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          updatedCount += 1;
        });

        return { updatedCount, totalCount: inputs.length };
      },
      args: [
        {
          operation,
          value,
          rounding,
        },
      ],
    });

    const summary = results?.[0]?.result;
    if (!summary || summary.totalCount === 0) {
      setStatus("未找到价格输入框，请确认页面已加载。", true);
      return;
    }
    setStatus(
      `已应用到价格输入框（${summary.updatedCount}/${summary.totalCount}）。`
    );
  } catch (error) {
    setStatus(`执行失败：${error.message}`, true);
  }
};

operationSelect.addEventListener("change", updateUiForOperation);
applyBtn.addEventListener("click", executeScript);
updateUiForOperation();
