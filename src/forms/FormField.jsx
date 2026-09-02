import React from "react";
import clsx from "clsx";
import PropTypes from "prop-types";
import { Eyebrow, inputClass } from "../design/components";

/**
 * The shared shape of every field helper in this folder: an optional label, a
 * control, optional help text and an optional validation message.
 *
 * The control is nested inside the `<label>` so it is named without an id
 * having to be threaded through the helper signatures, which is what the
 * inherited Bootstrap `Form.Group`/`Form.Label` pair did implicitly. Fields
 * whose control is not a single element (a directory picker, say) use
 * `FieldFrame` instead and label themselves.
 */
export function FormField({ label, required, help, invalid, invalidFeedback, className, children }) {
  // An unlabelled field is a plain wrapper: an empty `<label>` labels nothing
  // and only gets in the way of the control's own accessible name.
  const Wrapper = label ? "label" : "div";
  return (
    <Wrapper className={clsx("flex min-w-0 grow basis-0 flex-col gap-[6px]", required && "required", className)}>
      {label && <Eyebrow>{label}</Eyebrow>}
      {children}
      {help && <span className="text-[12px] text-dim">{help}</span>}
      {invalid && invalidFeedback && (
        <span role="alert" className="text-[12px] text-bad">
          {invalidFeedback}
        </span>
      )}
    </Wrapper>
  );
}

FormField.propTypes = {
  label: PropTypes.node,
  required: PropTypes.bool,
  help: PropTypes.node,
  invalid: PropTypes.bool,
  invalidFeedback: PropTypes.node,
  className: PropTypes.string,
  children: PropTypes.node,
};

/** A field wrapper that is not itself a label - for composite controls. */
export function FieldFrame({ className, children, ...props }) {
  return (
    <div className={clsx("flex min-w-0 grow basis-0 flex-col gap-[6px]", className)} {...props}>
      {children}
    </div>
  );
}

FieldFrame.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

/**
 * Text control shared by the field helpers. `as` picks the element the way
 * Bootstrap's `Form.Control` did, so the call sites keep passing
 * `as="textarea"` / `as="select"`; `size` is swallowed because it was a
 * Bootstrap sizing prop with no meaning here.
 */
export function Control({ as = "input", invalid, className, size: _size, ...props }) {
  const Element = as;
  return (
    <Element
      aria-invalid={invalid ? "true" : undefined}
      className={clsx(
        inputClass,
        "w-full text-[13px]",
        as === "select" && "cursor-pointer",
        invalid && "border-bad focus:border-bad",
        className,
      )}
      {...props}
    />
  );
}

Control.propTypes = {
  as: PropTypes.string,
  invalid: PropTypes.bool,
  className: PropTypes.string,
  size: PropTypes.string,
};
