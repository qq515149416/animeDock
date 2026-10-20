import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="text-6xl font-semibold text-sakura">404</p>
      <h1 className="mt-5 text-xl">这部番还没有来到这里</h1>
      <p className="mt-2 text-sm text-mut">页面不存在，或链接已经发生变化</p>
      <Link className="btn-primary mt-6" href="/anime">
        去动画库看看
      </Link>
    </div>
  );
}
