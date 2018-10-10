# Building Node.js

Depending on what platform or features you need, the build process may
differ. After you've built a binary, running the
test suite to confirm that the binary works as intended is a good next step.

If you can reproduce a test failure, search for it in the
[Node.js issue tracker](https://github.com/nodejs/node/issues) or
file a new issue.

## Table of Contents

* [Supported platforms](#supported-platforms)
  * [Input](#input)
  * [Strategy](#strategy)
  * [Supported platforms](#supported-platforms-1)
  * [Supported toolchains](#supported-toolchains)
    * [Unix](#unix)
    * [AIX](#aix)
    * [Windows](#windows)
    * [OpenSSL asm support](#openssl-asm-support)
* [Building Node.js on supported platforms](#building-nodejs-on-supported-platforms)
  * [Unix/macOS](#unixmacos)
    * [Prerequisites](#prerequisites)
    * [Building Node.js](#building-nodejs-1)
    * [Running Tests](#running-tests)
    * [Building the documentation](#building-the-documentation)
    * [Building a debug build](#building-a-debug-build)
  * [Windows](#windows-1)
  * [Android/Android-based devices (e.g. Firefox OS)](#androidandroid-based-devices-eg-firefox-os)
  * [`Intl` (ECMA-402) support](#intl-ecma-402-support)
    * [Default: `small-icu` (English only) support](#default-small-icu-english-only-support)
    * [Build with full ICU support (all locales supported by ICU)](#build-with-full-icu-support-all-locales-supported-by-icu)
      * [Unix/macOS](#unixmacos-1)
      * [Windows](#windows-2)
    * [Building without Intl support](#building-without-intl-support)
      * [Unix/macOS](#unixmacos-2)
      * [Windows](#windows-3)
    * [Use existing installed ICU (Unix/macOS only)](#use-existing-installed-icu-unixmacos-only)
    * [Build with a specific ICU](#build-with-a-specific-icu)
      * [Unix/macOS](#unixmacos-3)
      * [Windows](#windows-4)
* [Building Node.js with FIPS-compliant OpenSSL](#building-nodejs-with-fips-compliant-openssl)
* [Building Node.js with external core modules](#building-nodejs-with-external-core-modules)
  * [Unix/macOS](#unixmacos-4)
  * [Windows](#windows-5)

## Supported platforms

This list of supported platforms is current as of the branch/release to
which it is attached.

### Input

Node.js relies on V8 and libuv. Therefore, we adopt a subset of their
supported platforms.

### Strategy

Support is divided into three tiers:

* **Tier 1**: Full test coverage and maintenance by the Node.js core team and
  the broader community.
* **Tier 2**: Full test coverage but more limited maintenance,
  often provided by the vendor of the platform.
* **Experimental**: May not compile reliably or test suite may not pass.
  These are often working to be promoted to Tier 2 but are not quite ready.
  There is at least one individual actively providing maintenance and the team
  is striving to broaden quality and reliability of support.

### Supported platforms

The community does not build or test against end-of-life distributions (EoL).
Thus, we do not recommend that you use Node on end-of-life or unsupported
platforms in production.

|  System      | Support type | Version                          | Architectures        | Notes            |
|--------------|--------------|----------------------------------|----------------------|------------------|
| GNU/Linux    | Tier 1       | kernel >= 2.6.32, glibc >= 2.12  | x64, arm             |                  |
| GNU/Linux    | Tier 1       | kernel >= 3.10, glibc >= 2.17    | arm64                |                  |
| macOS/OS X   | Tier 1       | >= 10.11                         | x64                  |                  |
| Windows      | Tier 1       | >= Windows 7/2008 R2/2012 R2     | x86, x64             | [2](#fn2),[3](#fn3),[4](#fn4) |
| SmartOS      | Tier 2       | >= 15 < 16.4                     | x86, x64             | [1](#fn1) |
| FreeBSD      | Tier 2       | >= 11                            | x64                  |                  |
| GNU/Linux    | Tier 2       | kernel >= 3.13.0, glibc >= 2.19  | ppc64le >=power8     |                  |
| AIX          | Tier 2       | >= 7.1 TL04                      | ppc64be >=power7     |                  |
| GNU/Linux    | Tier 2       | kernel >= 3.10, glibc >= 2.17    | s390x                |                  |
| GNU/Linux    | Experimental | kernel >= 2.6.32, glibc >= 2.12  | x86                  | limited CI       |
| Linux (musl) | Experimental | musl >= 1.0                      | x64                  |                  |

<em id="fn1">1</em>: The gcc4.8-libs package needs to be installed, because node
  binaries have been built with GCC 4.8, for which runtime libraries are not
  installed by default. For these node versions, the recommended binaries
  are the ones available in pkgsrc, not the one available from nodejs.org.
  Note that the binaries downloaded from the pkgsrc repositories are not
  officially supported by the Node.js project, and instead are supported
  by Joyent. SmartOS images >= 16.4 are not supported because
  GCC 4.8 runtime libraries are not available in their pkgsrc repository

<em id="fn2">2</em>: Tier 1 support for building on Windows is only on 64 bit
  hosts. Support is experimental for 32 bit hosts.

<em id="fn3">3</em>: On Windows, running Node.js in Windows terminal emulators
  like `mintty` requires the usage of [winpty](https://github.com/rprichard/winpty)
  for the tty channels to work correctly (e.g. `winpty node.exe script.js`).
  In "Git bash" if you call the node shell alias (`node` without the `.exe`
  extension), `winpty` is used automatically.

<em id="fn4">4</em>: The Windows Subsystem for Linux (WSL) is not directly
  supported, but the GNU/Linux build process and binaries should work. The
  community will only address issues that reproduce on native GNU/Linux
  systems. Issues that only reproduce on WSL should be reported in the
  [WSL issue tracker](https://github.com/Microsoft/WSL/issues). Running the
  Windows binary (`node.exe`) in WSL is not recommended, and will not work
  without adjustment (such as stdio redirection).

### Supported toolchains

Depending on host platform, the selection of toolchains may vary.

#### Unix

* GCC 4.9.4 or newer
* Clang 3.4.2 or newer

#### AIX
* GCC 6.3 or newer

#### Windows

* Visual Studio 2017 with the Windows 10 SDK on a 64 bit host.

#### OpenSSL asm support

OpenSSL-1.1.0 requires the following asssembler version for use of asm
support on x86_64 and ia32.

* gas (GNU assembler) version 2.23 or higher
* xcode version 5.0 or higher
* llvm version 3.3 or higher
* nasm version 2.10 or higher in Windows

Otherwise `configure` will fail with an error. This can be avoided by
either providing a newer assembler as per the list above or by
using the `--openssl-no-asm` flag.

*Note:* The forthcoming OpenSSL-1.1.1 will require higher
 version. Please refer
 https://www.openssl.org/docs/man1.1.1/man3/OPENSSL_ia32cap.html for
 details.

## Building Node.js on supported platforms

*Note:* All prerequisites can be easily installed by following
[this bootstrapping guide](https://github.com/nodejs/node/blob/master/tools/bootstrap/README.md).

### Unix/macOS

#### Prerequisites

* `gcc` and `g++` 4.9.4 or newer, or
* `clang` and `clang++` 3.4.2 or newer (macOS: latest Xcode Command Line Tools)
* Python 2.6 or 2.7
* GNU Make 3.81 or newer

On macOS, you will need to install the `Xcode Command Line Tools` by running
`xcode-select --install`. Alternatively, if you already have the full Xcode
installed, you can find them under the menu `Xcode -> Open Developer Tool ->
More Developer Tools...`. This step will install `clang`, `clang++`, and
`make`.

If the path to your build directory contains a space, the build will likely
fail.

On FreeBSD and OpenBSD, you may also need:
* libexecinfo

#### Building Node.js

To build Node.js:

```console
$ ./configure
$ make -j4
```

Running `make` with the `-j4` flag will cause it to run 4 compilation jobs
concurrently which may significantly reduce build time. The number after `-j`
can be changed to best suit the number of processor cores on your machine. If
you run into problems running `make` with concurrency, try running it without
the `-j4` flag. See the
[GNU Make Documentation](https://www.gnu.org/software/make/manual/html_node/Parallel.html)
for more information.

Note that the above requires that `python` resolve to Python 2.6 or 2.7
and not a newer version.

After building, setting up [firewall rules](tools/macos-firewall.sh) can avoid
popups asking to accept incoming network connections when running tests.

Running the following script on macOS will add the firewall rules for the
executable `node` in the `out` directory and the symbolic `node` link in the
project's root directory.

```console
$ sudo ./tools/macos-firewall.sh
```

#### Running Tests

To verify the build:

```console
$ make test-only
```

At this point, you are ready to make code changes and re-run the tests.

If you are running tests prior to submitting a Pull Request, the recommended
command is:

```console
$ make -j4 test
```

`make -j4 test` does a full check on the codebase, including running linters and
documentation tests.

Optionally, continue below.

To run the tests and generate code coverage reports:

```console
$ ./configure --coverage
$ make coverage
```

This will generate coverage reports for both JavaScript and C++ tests (if you
only want to run the JavaScript tests then you do not need to run the first
command `./configure --coverage`).

The `make coverage` command downloads some tools to the project root directory
and overwrites the `lib/` directory. To clean up after generating the coverage
reports:

```console
$ make coverage-clean
```

#### Building the documentation

To build the documentation:

This will build Node.js first (if necessary) and then use it to build the docs:

```console
$ make doc
```

If you have an existing Node.js build, you can build just the docs with:

```console
$ NODE=/path/to/node make doc-only
```

To read the documentation:

```console
$ man doc/node.1
```

If you prefer to read the documentation in a browser,
run the following after `make doc` is finished:

```console
$ make docopen
```

This will open a browser with the documentation.

To test if Node.js was built correctly:

```console
$ ./node -e "console.log('Hello from Node.js ' + process.version)"
```

To install this version of Node.js into a system directory:

```console
$ [sudo] make install
```

#### Building a debug build

If you run into an issue where the information provided by the JS stack trace
is not enough, or if you suspect the error happens outside of the JS VM, you
can try to build a debug enabled binary:

```console
$ ./configure --debug
$ make -j4
```

`make` with `./configure --debug` generates two binaries, the regular release
one in `out/Release/node` and a debug binary in `out/Debug/node`, only the
release version is actually installed when you run `make install`.

To use the debug build with all the normal dependencies overwrite the release
version in the install directory:

``` console
$ make install --prefix=/opt/node-debug/
$ cp -a -f out/Debug/node /opt/node-debug/node
```

When using the debug binary, core dumps will be generated in case of crashes.
These core dumps are useful for debugging when provided with the
corresponding original debug binary and system information.

Reading the core dump requires `gdb` built on the same platform the core dump
was captured on (i.e. 64 bit `gdb` for `node` built on a 64 bit system, Linux
`gdb` for `node` built on Linux) otherwise you will get errors like
`not in executable format: File format not recognized`.

Example of generating a backtrace from the core dump:

``` console
$ gdb /opt/node-debug/node core.node.8.1535359906
$ backtrace
```

### Windows

Prerequisites:

* [Python 2.6 or 2.7](https://www.python.org/downloads/)
* The "Desktop development with C++" workload from
  [Visual Studio 2017](https://www.visualstudio.com/downloads/) or the
  "Visual C++ build tools" workload from the
  [Build Tools](https://www.visualstudio.com/downloads/#build-tools-for-visual-studio-2017),
  with the default optional components.
* Basic Unix tools required for some tests,
  [Git for Windows](http://git-scm.com/download/win) includes Git Bash
  and tools which can be included in the global `PATH`.
* The [NetWide Assembler](http://www.nasm.us/), for OpenSSL assembler modules.
  If not installed in the default location, it needs to be manually added
  to `PATH`. Build with `openssl-no-asm` option does not require this.
* **Optional** (to build the MSI): the [WiX Toolset v3.11](http://wixtoolset.org/releases/)
  and the [Wix Toolset Visual Studio 2017 Extension](https://marketplace.visualstudio.com/items?itemName=RobMensching.WixToolsetVisualStudio2017Extension).

If the path to your build directory contains a space or a non-ASCII character,
the build will likely fail.

```console
> .\vcbuild
```

To run the tests:

```console
> .\vcbuild test
```

To test if Node.js was built correctly:

```console
> Release\node -e "console.log('Hello from Node.js', process.version)"
```

### Android/Android-based devices (e.g. Firefox OS)

Although these instructions for building on Android are provided, please note
that Android is not an officially supported platform at this time. Patches to
improve the Android build are accepted. However, there is no testing on Android
in the current continuous integration environment. The participation of people
dedicated and determined to improve Android building, testing, and support is
encouraged.

Be sure you have downloaded and extracted
[Android NDK](https://developer.android.com/tools/sdk/ndk/index.html) before in
a folder. Then run:

```console
$ ./android-configure /path/to/your/android-ndk
$ make
```


### `Intl` (ECMA-402) support:

[Intl](https://github.com/nodejs/node/blob/master/doc/api/intl.md) support is
enabled by default, with English data only.

#### Default: `small-icu` (English only) support

By default, only English data is included, but
the full `Intl` (ECMA-402) APIs.  It does not need to download
any dependencies to function. You can add full
data at runtime.

#### Build with full ICU support (all locales supported by ICU):

With the `--download=all`, this may download ICU if you don't have an
ICU in `deps/icu`. (The embedded `small-icu` included in the default
Node.js source does not include all locales.)

##### Unix/macOS:

```console
$ ./configure --with-intl=full-icu --download=all
```

##### Windows:

```console
> .\vcbuild full-icu download-all
```

#### Building without Intl support

The `Intl` object will not be available, nor some other APIs such as
`String.normalize`.

##### Unix/macOS:

```console
$ ./configure --without-intl
```

##### Windows:

```console
> .\vcbuild without-intl
```

#### Use existing installed ICU (Unix/macOS only):

```console
$ pkg-config --modversion icu-i18n && ./configure --with-intl=system-icu
```

If you are cross compiling, your `pkg-config` must be able to supply a path
that works for both your host and target environments.

#### Build with a specific ICU:

You can find other ICU releases at
[the ICU homepage](http://icu-project.org/download).
Download the file named something like `icu4c-**##.#**-src.tgz` (or
`.zip`).

##### Unix/macOS

From an already-unpacked ICU:
```console
$ ./configure --with-intl=[small-icu,full-icu] --with-icu-source=/path/to/icu
```

From a local ICU tarball:
```console
$ ./configure --with-intl=[small-icu,full-icu] --with-icu-source=/path/to/icu.tgz
```

From a tarball URL:
```console
$ ./configure --with-intl=full-icu --with-icu-source=http://url/to/icu.tgz
```

##### Windows

First unpack latest ICU to `deps/icu`
[icu4c-**##.#**-src.tgz](http://icu-project.org/download) (or `.zip`)
as `deps/icu` (You'll have: `deps/icu/source/...`)

```console
> .\vcbuild full-icu
```

## Building Node.js with FIPS-compliant OpenSSL

This version of Node.js does not support FIPS.

## Building Node.js with external core modules

It is possible to specify one or more JavaScript text files to be bundled in
the binary as builtin modules when building Node.js.

### Unix/macOS

This command will make `/root/myModule.js` available via
`require('/root/myModule')` and `./myModule2.js` available via
`require('myModule2')`.

```console
$ ./configure --link-module '/root/myModule.js' --link-module './myModule2.js'
```

### Windows

To make `./myModule.js` available via `require('myModule')` and
`./myModule2.js` available via `require('myModule2')`:

```console
> .\vcbuild link-module './myModule.js' link-module './myModule2.js'
```
