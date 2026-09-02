import { describe, expect, it } from "vitest";
import { formFromPolicy, policyFromJSON, policyWithForm } from "../policy";
import type { KopiaPolicy } from "../../../api/types";

const HOURLY: KopiaPolicy = {
  scheduling: { intervalSeconds: 3600 },
  files: { ignore: ["~/.cache", "**/node_modules"] },
  retention: { keepLatest: 10, keepDaily: 7, keepWeekly: 4, keepMonthly: 6 },
  compression: { compressorName: "zstd" },
};

describe("formFromPolicy", () => {
  it("reads the five settings the form owns", () => {
    expect(formFromPolicy(HOURLY)).toEqual({
      schedule: "hourly",
      time: "03:00",
      exclude: "~/.cache\n**/node_modules",
      keepLatest: "10",
      keepDaily: "7",
      keepWeekly: "4",
      keepMonthly: "6",
      compression: "zstd",
    });
  });

  it("reads a daily schedule back as its time of day", () => {
    const f = formFromPolicy({ scheduling: { timeOfDay: [{ hour: 4, min: 5 }] } });
    expect(f.schedule).toBe("daily");
    expect(f.time).toBe("04:05");
  });

  it("calls an empty policy manual, with nothing kept and compression on auto", () => {
    expect(formFromPolicy({})).toMatchObject({ schedule: "manual", exclude: "", keepDaily: "", compression: "auto" });
  });

  it("refuses to round a schedule it cannot draw", () => {
    expect(formFromPolicy({ scheduling: { intervalSeconds: 900 } }).schedule).toBe("custom");
    expect(
      formFromPolicy({ scheduling: { timeOfDay: [{ hour: 3, min: 0 }, { hour: 15, min: 0 }] } }).schedule,
    ).toBe("custom");
    expect(formFromPolicy({ scheduling: { cron: ["0 3 * * *"] } }).schedule).toBe("custom");
  });
});

describe("policyWithForm", () => {
  it("round-trips through the form untouched", () => {
    expect(policyWithForm(HOURLY, formFromPolicy(HOURLY))).toEqual(HOURLY);
  });

  it("keeps sections and keys the form does not own", () => {
    const rich: KopiaPolicy = {
      ...HOURLY,
      errorHandling: { ignoreFileErrors: true },
      files: { ignore: ["~/.cache"], maxFileSize: 1000 },
    };
    const out = policyWithForm(rich, { ...formFromPolicy(rich), compression: "none" });
    expect(out.errorHandling).toEqual({ ignoreFileErrors: true });
    expect(out.files).toEqual({ ignore: ["~/.cache"], maxFileSize: 1000 });
    expect(out.compression).toEqual({ compressorName: "none" });
  });

  it("leaves a custom schedule alone", () => {
    const custom: KopiaPolicy = { scheduling: { cron: ["0 3 * * *"] } };
    expect(policyWithForm(custom, formFromPolicy(custom)).scheduling).toEqual({ cron: ["0 3 * * *"] });
  });

  it("writes a daily schedule as one time of day and drops the interval", () => {
    const out = policyWithForm(HOURLY, { ...formFromPolicy(HOURLY), schedule: "daily", time: "04:30" });
    expect(out.scheduling).toEqual({ timeOfDay: [{ hour: 4, min: 30 }] });
  });

  it("replaces a custom schedule once the form picks a real one", () => {
    const custom: KopiaPolicy = { scheduling: { cron: ["0 3 * * *"], runMissed: true } };
    const out = policyWithForm(custom, { ...formFromPolicy(custom), schedule: "hourly" });
    expect(out.scheduling).toEqual({ intervalSeconds: 3600, runMissed: true });
    expect(formFromPolicy(out).schedule).toBe("hourly");
  });

  it("falls back to the default time when the time field is empty", () => {
    const out = policyWithForm({}, { ...formFromPolicy({}), schedule: "daily", time: "" });
    expect(out.scheduling).toEqual({ timeOfDay: [{ hour: 3, min: 0 }] });
  });

  it("drops a section the form emptied instead of leaving it blank", () => {
    const out = policyWithForm(HOURLY, {
      ...formFromPolicy(HOURLY),
      exclude: "  \n ",
      keepLatest: "",
      keepDaily: "",
      keepWeekly: "",
      keepMonthly: "",
      compression: "auto",
    });
    expect(out).not.toHaveProperty("files");
    expect(out).not.toHaveProperty("retention");
    expect(out).not.toHaveProperty("compression");
  });

  it("ignores a keep field that is not a whole count", () => {
    const out = policyWithForm({}, { ...formFromPolicy({}), keepDaily: "-2", keepWeekly: "x" });
    expect(out).not.toHaveProperty("retention");
  });
});

describe("policyFromJSON", () => {
  it("accepts an object and an empty editor", () => {
    expect(policyFromJSON('{"retention":{"keepDaily":7}}').policy).toEqual({ retention: { keepDaily: 7 } });
    expect(policyFromJSON("   ").policy).toEqual({});
  });

  it("rejects anything that is not a policy object", () => {
    expect(policyFromJSON("[1,2]").error).toMatch(/JSON object/);
    expect(policyFromJSON("7").error).toMatch(/JSON object/);
    expect(policyFromJSON("null").error).toMatch(/JSON object/);
    expect(policyFromJSON("{oops").error).toBeTruthy();
  });
});
