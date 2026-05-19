import { execa } from "execa"

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execa("docker", ["info"], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

export async function runInContainer(
  image: string,
  command: string[],
  options?: { timeout?: number; workdir?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const args = ["run", "--rm"]
  if (options?.workdir) args.push("-w", options.workdir)
  args.push(image, ...command)
  try {
    const result = await execa("docker", args, {
      timeout: options?.timeout ?? 600_000,
      maxBuffer: 1024 * 1024,
    })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; exitCode?: number }
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "",
      exitCode: e.exitCode ?? 1,
    }
  }
}
