<script lang="ts">
  import { t } from '~/lib/i18n'
  import { REPOSITORY_URL } from '~/lib/links'
</script>

<footer class="flex flex-col items-center gap-3 mt-5 text-center">
  <a
    class="blend font-medium"
    href={`${REPOSITORY_URL}/issues`}
    target="_blank"
    rel="noreferrer">{t('reportBug')}</a>
  <span class="pill blend">
    {t('madeBy')}
    <b>
      <a
        class="underline"
        href="https://joacoesteban.com"
        target="_blank"
        rel="noreferrer">Joaco</a>
    </b>
  </span>
</footer>
