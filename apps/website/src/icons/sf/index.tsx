import type { SVGProps } from "react";

/**
 * SF Pro Symbols repackaged as React components. Paths use
 * `currentColor` so the parent's `color` controls the icon tint.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "fill">;

// These icons are decorative - the surrounding control supplies the accessible
// name - so every icon renders aria-hidden and non-focusable.
function withA11y(props: IconProps): SVGProps<SVGSVGElement> {
  return { "aria-hidden": true, focusable: false, ...props };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...withA11y(props)}
    >
      {/* Glyph bbox sits 0.39 left of centre; nudge right to centre it. */}
      <g transform="translate(0.391 0)">
        <path
          d="M1.56322 18H5.62069C5.93103 18 6.12644 17.7931 6.12644 17.4943V12.0115C6.12644 11.7126 6.32184 11.5057 6.63218 11.5057H10.5747C10.8851 11.5057 11.0805 11.7126 11.0805 12.0115V17.4943C11.0805 17.7931 11.2874 18 11.5977 18H15.6437C16.6322 18 17.2184 17.4138 17.2184 16.4368V7.87356C17.2184 7.14943 17.0345 6.71264 16.4713 6.24138L9.45977 0.37931C9.17241 0.137931 8.88506 0 8.5977 0C8.33333 0 8.04598 0.137931 7.74713 0.37931L0.747126 6.24138C0.183908 6.71264 0 7.14943 0 7.87356V16.4368C0 17.4138 0.574713 18 1.56322 18Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg
      width="25"
      height="18"
      viewBox="0 0 25 18"
      xmlns="http://www.w3.org/2000/svg"
      {...withA11y(props)}
    >
      {/* Asymmetric glyph: a hair left and high in its bbox; nudge to centre. */}
      <g transform="translate(0.075 0.226)">
        <path
          d="M21.8304 3.23926C23.3456 3.42232 24.1039 4.34499 24.1039 6.02734V14.7021C24.1038 16.5809 23.1471 17.5262 21.2347 17.5264H3.61462C1.70196 17.5264 0.745566 16.5922 0.745483 14.7021V6.02734C0.745483 4.34519 1.50314 3.42247 3.01794 3.23926V12.125C3.01794 13.6438 3.98582 14.2966 5.6283 14.1279C7.64223 13.9142 10.0617 14.3191 11.4681 15.2754C11.7606 15.4666 12.0868 15.579 12.4242 15.5791C12.7617 15.5791 13.0999 15.4667 13.3812 15.2754C14.799 14.3192 17.218 13.9142 19.2318 14.1279C20.8745 14.2967 21.8304 13.6439 21.8304 12.125V3.23926Z"
          fill="currentColor"
        />
        <path
          d="M11.2544 13.599C9.51038 12.8677 7.09132 12.5526 5.3586 12.7327C4.69476 12.8114 4.33472 12.5301 4.33472 11.9338V1.31243C4.33472 0.558579 4.72852 0.0972697 5.52737 0.0410124C7.74391 -0.094005 10.073 0.468568 11.3444 1.28992C11.6707 1.49245 11.7719 1.72873 11.7719 2.2913V13.284C11.7719 13.6103 11.5694 13.734 11.2544 13.599ZM13.5947 13.599C13.2909 13.734 13.0883 13.6103 13.0883 13.284V2.2913C13.0883 1.72873 13.1896 1.49245 13.5047 1.28992C14.7761 0.468568 17.1051 -0.094005 19.3217 0.0410124C20.1205 0.0972697 20.5143 0.558579 20.5143 1.31243V11.9338C20.5143 12.5301 20.1543 12.8114 19.4904 12.7327C17.7577 12.5526 15.3274 12.8677 13.5947 13.599Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg
      width="22"
      height="21"
      viewBox="0 0 22 21"
      xmlns="http://www.w3.org/2000/svg"
      {...withA11y(props)}
    >
      {/* Centre the bbox (+0.44 x, +0.40 y), then a small optical nudge down
          (~0.6) so the pointed apex stops reading high. */}
      <g transform="translate(0.44 1)">
        <path
          d="M10.564 0C11.215 4.55724e-05 11.6643 0.468327 11.9302 1.30273L13.6724 6.72168H19.3853C20.2564 6.7217 20.8433 7.01553 21.0542 7.62988C21.2649 8.2533 20.9535 8.84047 20.2476 9.34473L15.5796 12.6826L17.4136 18.1201C17.6886 18.9269 17.5784 19.5774 17.065 19.9717C16.5423 20.3751 15.8915 20.2469 15.1763 19.7334L10.564 16.332L5.93312 19.7334C5.22705 20.2469 4.57591 20.3751 4.05324 19.9717C3.54006 19.5774 3.4297 18.9267 3.7046 18.1201L5.53859 12.6826L0.871596 9.34473C0.165524 8.84039 -0.14595 8.25283 0.0649549 7.62012C0.275994 7.01526 0.862461 6.7217 1.72413 6.72168H7.44581L9.188 1.30273C9.45392 0.468287 9.90376 0 10.564 0Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <svg
      width="16"
      height="17"
      viewBox="0 0 16 17"
      xmlns="http://www.w3.org/2000/svg"
      {...withA11y(props)}
    >
      {/* Centre the head+body bbox (it sits a touch left and high). */}
      <g transform="translate(0.196 0.133)">
        <path
          d="M7.80371 9.73828C12.5536 9.73831 15.6074 12.9475 15.6074 15.2949C15.6074 16.1934 14.9378 16.7343 13.8193 16.7344H1.78809C0.669526 16.7343 3.17698e-05 16.1935 0 15.2949C0 12.9475 3.04461 9.73828 7.80371 9.73828ZM7.80371 0C9.84854 3.43077e-05 11.5537 1.78799 11.5537 4.02539C11.5536 6.3269 9.86683 8.13278 7.80371 8.13281C5.74052 8.13281 4.05273 6.32662 4.05273 4.03418C4.05285 1.80603 5.75892 0 7.80371 0Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
