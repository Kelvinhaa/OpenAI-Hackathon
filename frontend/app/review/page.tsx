import { Suspense } from "react";
import ReviewClient from "./ReviewClient";

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewClient />
    </Suspense>
  );
}
