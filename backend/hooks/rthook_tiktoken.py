# Runtime hook: pre-import tiktoken_ext.openai_public before tiktoken's lazy
# plugin discovery fires.  In a PyInstaller frozen bundle, pkgutil.iter_modules
# may not enumerate modules inside a namespace package reliably.  By importing
# the module here (before any application code runs), its ENCODING_CONSTRUCTORS
# dict is already in sys.modules and tiktoken's registry._find_constructors()
# can re-import it without relying on pkgutil.
try:
    import tiktoken_ext.openai_public  # noqa: F401 — side-effect import
except Exception:
    pass
