<script lang="ts">
  import logo from '~/assets/icon.png'
  import { t } from '~/lib/i18n'
  import { REPOSITORY_URL } from '~/lib/links'
</script>

<footer class="flex flex-col items-center gap-3 mt-5 text-center">
  <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
    <img src={logo} alt="Snag" class="w-8 h-8" />
  </a>
  <a
    class="blend font-medium"
    href={`${REPOSITORY_URL}/issues`}
    target="_blank"
    rel="noreferrer">{t('reportBug')}</a>
  <code class="pill blend">
    {t('madeBy')}
    <b>
      <a
        class="underline"
        href="https://joacoesteban.com"
        target="_blank"
        rel="noreferrer">Joaco</a>
    </b>
  </code>
</footer>
