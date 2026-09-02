import React from "react";
import clsx from "clsx";
import PropTypes from "prop-types";

/**
 * The two layout primitives the inherited single-user pages were built on.
 *
 * They stood in for Bootstrap's grid, which is gone; a row is a wrapping flex
 * line and a column is an equal share of it, which is all those pages ever
 * asked the grid for. `auto` keeps a column at its content width - Bootstrap's
 * `xs="auto"` - and a numeric `sm` keeps Bootstrap's `sm={n}` behaviour: the
 * column is full width on a narrow screen and an equal share from `sm` up, so
 * a policy row stacks its label and values instead of squeezing into three.
 */
export function Row({ className, children, ...props }) {
  return (
    <div className={clsx("flex flex-wrap items-start gap-4", className)} {...props}>
      {children}
    </div>
  );
}

Row.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

export function Col({ xs, sm, md, lg: _lg, className, children, ...props }) {
  const auto = xs === "auto" || sm === "auto" || md === "auto";
  const stacks = typeof sm === "number";
  return (
    <div
      className={clsx("min-w-0", auto ? "shrink-0" : stacks ? "grow basis-full sm:basis-0" : "grow basis-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}

Col.propTypes = {
  xs: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  sm: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  md: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  lg: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
  children: PropTypes.node,
};
