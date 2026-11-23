INSERT INTO public.festival_themes(key,name,recurrence,asset_pack,palette_json,particle_config_json)
VALUES
 ('spring','春节','lunar_table','spring','{"accent":"#a94137"}','{"kind":"red-envelope"}'),
 ('dragon','端午','lunar_table','dragon','{"accent":"#39725b"}','{"kind":"bamboo"}'),
 ('moon','中秋','lunar_table','moon','{"accent":"#96621e"}','{"kind":"osmanthus"}'),
 ('halloween','万圣节','solar','/assets/festivals/halloween/','{"accent":"#97511e"}','{"kind":"maple-bat"}'),
 ('winter','圣诞与元旦','solar','winter','{"accent":"#356a5b"}','{"kind":"snow-star"}')
ON CONFLICT (key) DO NOTHING;
