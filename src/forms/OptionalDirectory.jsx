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
 * If the desktop app is not present, the button is not visible.
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
export function OptionalDirectory(component, label, name, props = {}) {
  /**
   * Saves the selected path as a deepstate variable within the component
   * @param {The path that has been selected} path
   */
  function onDirectorySelected(path) {
    setDeepStateProperty(component, name, path);
  }

  const inputID = "directoryInput-" + name;

  return (
    <FieldFrame>
      {label && (
        <label htmlFor={inputID}>
          <Eyebrow>{label}</Eyebrow>
        </label>
      )}
      <div className="flex items-center gap-2">
        <Control
          id={inputID}
          name={name}
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
    </FieldFrame>
  );
}
