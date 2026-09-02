import { use, useState } from "react";
import clsx from "clsx";
import { NotificationEditor } from "../components/notifications/NotificationEditor";
import { UIPreferencesContext } from "../contexts/UIPreferencesContext";
import { Eyebrow, Select } from "../design/components";
import { Col, Row } from "../components/Layout";

const TABS = [
  { key: "appearance", label: "Appearance" },
  { key: "notifications", label: "Notifications" },
];

/**
 * Preferences: how the UI is drawn, and where it sends notifications.
 *
 * The three selects keep their upstream ids - the e2e suite drives them by id
 * (`#themeSelector`, `#fontSizeInput`, `#bytesBaseInput`).
 */
export function Preferences() {
  const { theme, bytesStringBase2, fontSize, setByteStringBase, setTheme, setFontSize } = use(UIPreferencesContext);
  const [tab, setTab] = useState("appearance");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Preferences</Eyebrow>
        <h1 className="font-display m-0 mt-2 text-[36px] leading-none font-extrabold tracking-[-0.02em]">
          How this looks
        </h1>
      </div>

      <div role="tablist" aria-label="Preferences" className="flex gap-[22px] border-b border-line-strong">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={"tab-" + t.key}
            aria-selected={tab === t.key}
            aria-controls={"panel-" + t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "cursor-pointer border-0 border-b-2 bg-transparent pb-2 text-[12px] font-medium tracking-[0.04em] uppercase",
              tab === t.key ? "border-ember text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "appearance" ? (
        <div role="tabpanel" id="panel-appearance" aria-labelledby="tab-appearance">
          <Row>
            <Col>
              <label className="flex flex-col gap-[6px]">
                <Eyebrow>Theme</Eyebrow>
                <Select
                  title="Select theme"
                  id="themeSelector"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="light">light</option>
                  <option value="dark">dark</option>
                  <option value="pastel">pastel</option>
                  <option value="ocean">ocean</option>
                </Select>
              </label>
            </Col>
            <Col>
              <label className="flex flex-col gap-[6px]">
                <Eyebrow>Appearance</Eyebrow>
                <Select
                  title="Select font size"
                  id="fontSizeInput"
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                >
                  <option value="fs-6">small</option>
                  <option value="fs-5">medium</option>
                  <option value="fs-4">large</option>
                </Select>
              </label>
            </Col>
            <Col>
              <label className="flex flex-col gap-[6px]">
                <Eyebrow>Byte representation</Eyebrow>
                <Select
                  title="Select byte representation"
                  id="bytesBaseInput"
                  value={bytesStringBase2}
                  onChange={(e) => setByteStringBase(e.target.value)}
                >
                  <option value="true">Base-2 (KiB, MiB, GiB, TiB)</option>
                  <option value="false">Base-10 (KB, MB, GB, TB)</option>
                </Select>
              </label>
            </Col>
          </Row>
        </div>
      ) : (
        <div role="tabpanel" id="panel-notifications" aria-labelledby="tab-notifications">
          <NotificationEditor />
        </div>
      )}
    </div>
  );
}
