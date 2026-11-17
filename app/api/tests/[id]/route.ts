import { serveTest, testParams } from "../../../../lib/test-bank";

export function generateStaticParams() {
  return testParams();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return serveTest((await params).id, "current");
}