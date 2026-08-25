import Image from 'next/image';

/*
 * The Slotly symbol. One component wraps the asset so the corner lockup and the
 * large brand panel can never drift apart — size it from the caller with
 * `h-* w-auto`.
 *
 * The file is cropped to the artwork's bounding box (306 x 400), so the box the
 * mark occupies is the mark itself and it optically centres wherever it lands.
 *
 * Decorative by design: every placement either sits beside the "Slotly" wordmark
 * or is pure brand furniture, so naming it here would only make a screen reader
 * announce the brand twice.
 */
export function SlotlyMark({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/assets/logo.png"
      alt=""
      width={306}
      height={400}
      priority={priority}
      className={className}
    />
  );
}
