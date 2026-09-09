-- Replace legacy landing anchors with safe, real destinations.
update public.site_content
set content = jsonb_set(
  jsonb_set(
    content,
    '{footerWhatsappUrl}',
    case
      when coalesce(content->>'footerWhatsappUrl', '') = ''
        or content->>'footerWhatsappUrl' like '#%'
      then '""'::jsonb
      else content->'footerWhatsappUrl'
    end,
    true
  ),
  '{footerTermsUrl}',
  case
    when coalesce(content->>'footerTermsUrl', '') = ''
      or content->>'footerTermsUrl' like '#%'
    then '"/terminos"'::jsonb
    else content->'footerTermsUrl'
  end,
  true
)
where id = 'landing';
