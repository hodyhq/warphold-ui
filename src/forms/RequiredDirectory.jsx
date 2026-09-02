import React from "react";
import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { stateProperty } from ".";
import { setDeepStateProperty } from "../utils/deepstate";
import { Button, Eyebrow } from "../design/components";
import { Control, FieldFrame } from "./FormField";

/**
 * This functions returns a directory selector that allows the user to select a directory.
 * The selections is invoked using a button that calls a functions within the desktop app.
 * If the desktop app is not present, the button is not visible. The path is required.
 *
 * @param {*} component
 * The component that this function is called from
 * @param {string} label
 * Label, that is added before the input field
 * @param {string} name
 * Name of the variable in which the directory path is stored
 * @param {*} props
 * Additional properties of the component
 * @returns The form group with the components
 */
export function RequiredDirectory(component, label, name, props = {}) {
  /**
   * Saves the selected path as a deepstate variable within the component
   * @param {The path that has been selected} path
   */
  function onDirectorySelected(path) {
    setDeepStateProperty(component, name, path);
  }

  const invalid = stateProperty(component, name, null) === "";

  return (
    <FieldFrame className="required">
      {label && (
        <label htmlFor="directoryInput" className="required">
          <Eyebrow>{label}</Eyebrow>
        </label>
      )}
      <div className="flex items-center gap-2">
        <Control
          id="directoryInput"
          name={name}
          invalid={invalid}
          value={stateProperty(component, name)}
          data-testid={"control-" + name}
          onChange={component.handleChange}
          aria-label={label || "Directory path"}
          {...props}
        />
        {window.kopiaUI && (
          <Button title="Browse for a directory" onClick={() => window.kopiaUI.selectDirectory(onDirectorySelected)}>
            <FontAwesomeIcon icon={faFolderOpen} />
          </Button>
        )}
      </div>
      {invalid && (
        <span role="alert" className="text-[12px] text-bad">
          Required field
        </span>
      )}
    </FieldFrame>
  );
}
